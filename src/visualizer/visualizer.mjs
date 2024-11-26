// @ts-check
import {
  getTaskGroupTimeRanges,
  getTaskTimeRanges,
  getTasks,
  isTaskGroupIdValid,
  taskGraphToTasks,
} from '../taskcluster.mjs';
import { getProfile } from '../profiler.mjs';
import {
  asAny,
  encodeUintArrayForUrlComponent,
  ensureExists,
  exposeAsGlobal,
  getServer,
  getElement,
  changeLocation,
} from '../utils.mjs';

// Work around ts(2686)
//   > 'd3' refers to a UMD global, but the current file is a module.
//   > Consider adding an import instead.
const d3 = window.d3;

// Work around ts(2686)
//   > 'd3' refers to a UMD global, but the current file is a module.
//   > Consider adding an import instead.
const dat = window.dat;

console.log('Override the profiler origin with window.profilerOrigin');
asAny(window).profilerOrigin = 'https://profiler.firefox.com';
// asAny(window).profilerOrigin = 'http://localhost:4242';

const elements = {
  taskGroup: /** @type {HTMLInputElement} */ (getElement('taskGroup')),
  mergeChunks: /** @type {HTMLInputElement} */ (getElement('mergeChunks')),
  fetchDependentTasks: /** @type {HTMLInputElement} */ (
    getElement('fetchDependentTasks')
  ),
  server: /** @type {HTMLInputElement} */ (getElement('server')),
  graph: getElement('graph'),
  info: getElement('info'),
  controls: getElement('controls'),
  infoMessage: getElement('info-message'),
  profiler: getElement('profiler'),
};

setupHandlers();
init().catch((error) => {
  elements.infoMessage.innerText =
    'Failed to fetch the task. See the console for more details.';
  console.log(error);
});

/**
 * @param {TaskGraph} taskGraph
 */
async function loadTaskGraphJSON(taskGraph) {
  // updateStatusMessage('Fetching the tasks…');
  // const response = await fetch('assets/task-graph.json');

  // /** @type {TaskGraph} */
  // const taskGraph = await response.json();
  const tasks = taskGraphToTasks(
    taskGraph,
    getIsMergeChunks(),
    getMergeTaskTypes(),
  );

  exposeAsGlobal('taskGraph', taskGraph);
  exposeAsGlobal('tasks', tasks);
  render(tasks, true /* isTaskGraphDefinition */);
}

async function init() {
  const taskGroupIds = getTaskGroupIds();
  if (taskGroupIds.length === 0) {
    return;
  }
  updateStatusMessage('Fetching the tasks…');

  const server = getServer();

  const result = await getTasks(
    taskGroupIds,
    server,
    getIsMergeChunks(),
    getFetchDependentTasks(),
    getMergeTaskTypes(),
    updateStatusMessage,
    new Set(getIgnoredTaskGroupIds()),
  );

  if (result) {
    const { mergedTasks, taskGroups } = result;
    exposeAsGlobal('taskGroups', taskGroups);
    render(mergedTasks, false /* isTaskGraphDefinition */);
    setupProfilerButton(taskGroups, new URL(server));
    reportTime(taskGroups);
  } else {
    updateStatusMessage('No tasks were found.');
  }
}

/**
 * @param {TaskGroup[]} taskGroups
 */
function reportTime(taskGroups) {
  // This is kind of hacky, but determine the cost of this run. The rates below
  // are the hourly rate.
  // https://docs.google.com/spreadsheets/d/1-mn60Kwp-IUJ99XfiUkxYv4DX-H6CQDwIUV4WnaykJk/edit#gid=118509819
  const costPreemptibleGPU = 0.99;
  const costNonPreemptibleGPU = 3.42;
  const costCpu = 0.14;
  const costs = {
    teacher: costPreemptibleGPU,
    student: costPreemptibleGPU,
    backtranslations: costPreemptibleGPU,
    bicleaner: costPreemptibleGPU,
    evaluate: costPreemptibleGPU,
  };
  /**
   * @param {TaskAndStatus} task
   * @returns {number}
   */
  const getCost = (task) =>
    task.task.workerType.endsWith('-standard')
      ? costNonPreemptibleGPU
      : costPreemptibleGPU;

  for (const taskGroup of taskGroups) {
    for (const task of taskGroup.tasks) {
      if (task.task.metadata.name.startsWith('train-student-')) {
        costs.student = getCost(task);
      }
      if (task.task.metadata.name.startsWith('train-teacher-')) {
        costs.teacher = getCost(task);
      }
      if (task.task.metadata.name.startsWith('train-backwards-')) {
        costs.teacher = getCost(task);
      }
      if (task.task.metadata.name.startsWith('bicleaner-ai-')) {
        costs.bicleaner = getCost(task);
      }
    }
  }
  /** @type {any[]} */
  const table = [];
  /**
   * @param {string} description
   * @param {number} hours
   * @param {string} duration
   * @param {number} [costPerHour]
   */
  function log(description, hours, duration, costPerHour) {
    let cost = '';
    if (costPerHour) {
      cost = `$${(costPerHour * hours).toFixed(2)}`;
    }
    table.push({ description, hours, duration, cost });
  }
  if (getIsMergeChunks()) {
    console.log('Reporting time is not supported with merging chunks.');
  }
  {
    const wallTime = getWallTime(
      mergeOverlappingTimeRanges(getTaskGroupTimeRanges(taskGroups)),
    );
    log(
      'Task group wall time:',
      reportHours(wallTime),
      humanizeDuration(wallTime),
    );
  }
  const taskTimeRanges = getTaskTimeRanges(taskGroups);
  {
    const wallTime = getWallTime(mergeOverlappingTimeRanges(taskTimeRanges));
    log(
      'Task run wall time:',
      reportHours(wallTime),
      humanizeDuration(wallTime),
    );
  }

  const taskRunTime = getTimeRangeDuration(taskTimeRanges);

  /**
   * @param {string} message
   * @param {(task: TaskAndStatus) => boolean} filterFn
   * @param {number} [cost]
   * @returns {number}
   */
  const logFiltered = (message, filterFn, cost) => {
    const runTime = getTimeRangeDuration(
      getTaskTimeRanges(taskGroups, filterFn),
    );
    log(message, reportHours(runTime), humanizeDuration(runTime), cost);
    return runTime;
  };

  const gpuRunTime = logFiltered(
    'Total gpu task run time:',
    ({ task }) =>
      task.workerType.includes('-gpu') && task.workerType.includes('-standard'),
    costNonPreemptibleGPU,
  );
  const gpuPreemptibleRunTime = logFiltered(
    'Total preemptible gpu task run time:',
    ({ task }) =>
      task.workerType.includes('-gpu') &&
      !task.workerType.includes('-standard'),
    costPreemptibleGPU,
  );
  const cpuTime = taskRunTime - gpuPreemptibleRunTime - gpuRunTime;

  log(
    'Total cpu task run time:',
    reportHours(cpuTime),
    humanizeDuration(cpuTime),
    costCpu,
  );

  table.push({
    description: 'Total task run time:',
    hours: reportHours(taskRunTime),
    duration: humanizeDuration(taskRunTime),
    cost:
      '$' +
      (
        reportHours(cpuTime) * costCpu +
        reportHours(gpuRunTime) * costNonPreemptibleGPU +
        reportHours(gpuPreemptibleRunTime) * costPreemptibleGPU
      ).toFixed(2),
  });

  logFiltered(
    'Train Backwards:',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('train-backwards');
    },
    costs.backtranslations,
  );

  logFiltered(
    'Train Teacher:',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('train-teacher');
    },
    costs.teacher,
  );

  logFiltered(
    'Train Student:',
    ({ task }) => {
      const { name } = task.metadata;
      return (
        name.startsWith('train-student-') || name.startsWith('finetune-student')
      );
    },
    costs.student,
  );

  logFiltered(
    'Synthesize student data (mono-src):',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('translate-mono-src');
    },
    costPreemptibleGPU,
  );

  logFiltered(
    'Synthesize backtranslation data (mono-trg):',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('translate-mono-trg');
    },
    costPreemptibleGPU,
  );

  logFiltered(
    'Translate "corpus" time',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('translate-corpus');
    },
    costPreemptibleGPU,
  );

  logFiltered(
    'Compute alignments',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('alignments-');
    },
    costCpu,
  );

  logFiltered(
    'Bicleaner AI',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('bicleaner-ai-');
    },
    costs.bicleaner,
  );

  logFiltered(
    'Evaluations',
    ({ task }) => {
      const { name } = task.metadata;
      return name.startsWith('evaluate-');
    },
    costs.evaluate,
  );

  console.table(table);
}

/**
 * @param {TimeRange[]} timeRanges
 */
function getTimeRangeDuration(timeRanges) {
  let taskTime = 0;
  for (const { start, end } of timeRanges) {
    if (start && end) {
      taskTime += end - start;
    }
  }
  return taskTime;
}

/**
 * @param {TimeRange[]} timeRangesWithNulls
 * @returns {number}
 */
function getWallTime(timeRangesWithNulls) {
  const timeRanges = mergeOverlappingTimeRanges(timeRangesWithNulls);

  let wallTime = 0;
  for (const timeRange of timeRanges) {
    const { start, end } = timeRange;
    if (start === null || end === null) {
      continue;
    }
    wallTime += end - start;
  }
  return wallTime;
}

function setupHandlers() {
  handleFileDrop();
  handleFileURL();
  elements.server.value = getServer();
  elements.server.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      try {
        const url = new URL(elements.server.value);
        const validatedUrl = url.toString();
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('server', validatedUrl);
        changeLocation(urlParams);
      } catch {}
    }
  });

  elements.taskGroup.addEventListener('keydown', (event) => {
    const taskGroupId =
      /** @type {HTMLInputElement } */ elements.taskGroup.value;
    if (event.key === 'Enter' && taskGroupId) {
      if (!isTaskGroupIdValid(taskGroupId)) {
        alert('The task group id was not valid');
        return;
      }
      const ids = getTaskGroupIds();
      ids.push(taskGroupId);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('taskGroupIds', ids.join(','));
      changeLocation(urlParams);
    }
  });

  elements.mergeChunks.checked = getIsMergeChunks();
  elements.mergeChunks.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('mergeChunks', elements.mergeChunks.checked.toString());
    changeLocation(urlParams);
  });

  elements.fetchDependentTasks.checked = getFetchDependentTasks();
  elements.fetchDependentTasks.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set(
      'fetchDependentTasks',
      elements.fetchDependentTasks.checked.toString(),
    );
    changeLocation(urlParams);
  });

  for (const taskGroupId of getTaskGroupIds()) {
    const div = document.createElement('div');
    const closeButton = document.createElement('button');
    const a = document.createElement('a');

    closeButton.className = 'closeButton';
    closeButton.setAttribute('title', 'Remove the task group');
    closeButton.innerText = '𝗫';
    closeButton.addEventListener('click', () => {
      let ids = getTaskGroupIds();
      ids = ids.filter((id) => id !== taskGroupId);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('taskGroupIds', ids.join(','));
      changeLocation(urlParams);
    });
    div.appendChild(closeButton);

    const span = document.createElement('span');
    span.innerText = 'Task Group: ';
    div.appendChild(span);

    a.innerText = taskGroupId;
    a.setAttribute('href', `${getServer()}/tasks/groups/${taskGroupId}`);
    div.appendChild(a);

    // Add it to the page.
    elements.controls.insertBefore(div, elements.mergeChunks.parentElement);
  }

  for (const mergeTaskType of getMergeTaskTypes() ?? []) {
    const div = document.createElement('div');
    const closeButton = document.createElement('button');

    closeButton.className = 'closeButton';
    closeButton.setAttribute('title', 'Remove the merge task group');
    closeButton.innerText = '𝗫';
    closeButton.addEventListener('click', () => {
      let taskTypes = getMergeTaskTypes() ?? [];
      taskTypes = taskTypes.filter((id) => id !== mergeTaskType);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('mergeTaskType', [...new Set(taskTypes)].join(','));
      changeLocation(urlParams);
    });
    div.appendChild(closeButton);

    const span = document.createElement('span');
    span.innerText = 'Merge: ';
    div.appendChild(span);

    const b = document.createElement('b');
    b.innerText = `"${mergeTaskType}"`;
    div.appendChild(b);

    // Add it to the page.
    elements.controls.insertBefore(div, elements.mergeChunks.parentElement);
  }
}

/**
 * @param {string} message
 */
function updateStatusMessage(message) {
  elements.infoMessage.innerText = message;
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {URL} taskClusterURL
 */
function setupProfilerButton(taskGroups, taskClusterURL) {
  elements.profiler.addEventListener('click', async () => {
    const profile = getProfile(taskGroups, taskClusterURL);

    const threadSelection = encodeUintArrayForUrlComponent(
      profile.threads.map((_thread, i) => i),
    );

    // By default select all the threads.
    const params = `?thread=${threadSelection}`;
    const { profilerOrigin } = asAny(window);

    const profilerURL = profilerOrigin + '/from-post-message/' + params;

    const profilerWindow = window.open(profilerURL, '_blank');

    if (!profilerWindow) {
      console.error('Failed to open the new window.');
      return;
    }

    // Wait for the profiler page to respond that it is ready.
    let isReady = false;

    /**
     * @param {MessageEvent} event
     */
    const listener = ({ data }) => {
      if (data?.name === 'ready:response') {
        console.log('The profiler is ready. Injecting the profile.');
        isReady = true;
        const message = {
          name: 'inject-profile',
          profile,
        };
        profilerWindow.postMessage(message, profilerOrigin);
        window.removeEventListener('message', listener);
      }
    };

    window.addEventListener('message', listener);
    while (!isReady) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      profilerWindow.postMessage({ name: 'ready:request' }, profilerOrigin);
    }

    window.removeEventListener('message', listener);
  });
}

/**
 * Should the task chunks be merged?
 *
 * @returns {boolean}
 */
function getIsMergeChunks() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('mergeChunks') === 'true';
}

/**
 * Should the dependent chunks be fetched?
 *
 * @returns {boolean}
 */
function getFetchDependentTasks() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('fetchDependentTasks') === 'true';
}

function getMergeTaskTypes() {
  const urlParams = new URLSearchParams(window.location.search);
  const text = urlParams.get('mergeTaskType');
  if (text) {
    return [...new Set(text.split(','))];
  }
  return null;
}

/**
 * @returns {string[]}
 */
function getTaskGroupIds() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const taskGroupIdParam = urlParams.get('taskGroupIds');

  // "PuI6mYZPTUqAfyZMTgeUng", "S5E71GihQM6Te_KdrUmATw"

  if (!taskGroupIdParam) {
    return [];
  }

  // Parse the taskGroupId values into an array
  const taskGroupIds = taskGroupIdParam.split(',');
  return taskGroupIds;
}

/**
 * @returns {string[]}
 */
function getIgnoredTaskGroupIds() {
  const urlParams = new URLSearchParams(window.location.search);
  // Extract the taskGroupId parameter
  const taskGroupIdParam = urlParams.get('ignoredTaskGroupIds');

  // "PuI6mYZPTUqAfyZMTgeUng", "S5E71GihQM6Te_KdrUmATw"

  if (!taskGroupIdParam) {
    return [];
  }

  // Parse the taskGroupId values into an array
  const taskGroupIds = taskGroupIdParam.split(',');
  return taskGroupIds;
}

/**
 * @param {TaskAndStatus[]} tasks
 * @param {boolean} isTaskGraphDefinition
 */
function render(tasks, isTaskGraphDefinition) {
  if (tasks.length === 0) {
    updateStatusMessage('There were no tasks in the task group');
    return;
  }
  elements.info.style.display = 'none';

  for (const task of tasks) {
    const match = task.task.tags.label?.match(/^all-(\w+)-(\w+)$/);
    if (match) {
      const src = match[1];
      const trg = match[2];
      const div = document.createElement('div');
      div.id = 'trainingRun';
      div.innerHTML = `Training run: <b>${src}-${trg}</b>`;

      elements.controls.append(div);
      break;
    }
  }

  const gui = new dat.GUI();
  const guiControls = {
    nodeSize: 1,
    linkSize: 1,
  };

  /**
   * @type {Record<string, number>}
   */
  const orderingX = {
    build: -0.2,
    toolchain: -0.2,
    fetch: 0,
    dataset: 0.3,
    'train-backwards': 0.5,
    'train-teacher': 0.7,
    'train-student': 0.9,
    train: 0.8,
    evaluate: 1.0,

    quantize: 2,
    export: 2,
    all: 2,
  };

  /**
   * @type {Record<string, number>}
   */
  const orderingY = {
    train: 0.9,
    merge: 0.9,
    evaluate: 0.0,
  };

  /**
   * @type {Record<string, number>}
   */
  const nodeScale = {
    build: 1,
    fetch: 1,
    merge: 2,
    translate: 2,
    dataset: 1,
    train: 5,
    'train-vocab': 1,
    all: 1,
  };

  /** @type {Record<string, number>} */
  const groups = {
    train: 0,
    finetune: 0,

    'train-vocab': 1,
    alignments: 1,

    build: 2,
    fetch: 2,
    toolchain: 2,

    all: 3,
    export: 3,
    quantize: 3,

    evaluate: 4,
    score: 4,

    dataset: 5,

    clean: 6,
    bicleaner: 6,
    cefilter: 6,

    split: 7,
    collect: 7,
    extract: 7,

    translate: 8,
  };

  /**
   * @param {Node} d
   */
  function getNodeRadius(d) {
    const minSize = 6;
    if (isTaskGraphDefinition) {
      return (
        minSize *
        (nodeScale[d.taskType2] ?? nodeScale[d.taskType] ?? 1) *
        guiControls.nodeSize
      );
    }
    const range = maxDuration - minDuration;
    if (range === 0) {
      return minSize * guiControls.nodeSize;
    }
    return (
      Math.max(minSize, Math.sqrt(d.duration / range / Math.PI) * 150) *
      guiControls.nodeSize
    );
  }

  gui.add(guiControls, 'nodeSize', 0.1, 10).onChange(() => {
    node.attr('r', getNodeRadius);

    simulation.force('collision', collisionForce);
    simulation.alpha(0.3).restart();
  });
  gui.add(guiControls, 'linkSize', 0.1, 10).onChange(() => {
    simulation.force('link', linkForce);
    simulation.alpha(0.3).restart();
  });

  // Specify the dimensions of the chart.
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Specify the color scale.
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  /**
   * @param {TaskAndStatus} task
   * @param {number} count
   */
  function getTaskType(task, count) {
    let { label } = task.task.tags;
    if (!label) {
      return '';
    }
    // Handle things like "build (merged)"
    label = label.split(' ')[0];
    if (!label) {
      return '';
    }

    const parts = label.split('-');
    if (parts.length < count) {
      return '';
    }
    return parts.slice(0, count).join('-');
  }

  const typesSet = new Set(tasks.map((task) => getTaskType(task, 1)));

  let maxOrdinal = 0;
  for (const [key, ordinal] of Object.entries(groups)) {
    typesSet.delete(key);
    maxOrdinal = Math.max(ordinal);
  }
  const typesArray = [...typesSet];

  /**
   * @param {string} taskType
   * @param {string} taskType2
   * @returns {number}
   */
  function getGroup(taskType, taskType2) {
    return (
      groups[taskType2] ??
      groups[taskType] ??
      typesArray.findIndex((type) => type === taskType) + maxOrdinal
    );
  }

  /**
   * This node function exists so that Typescript can infer the type.
   * @param {TaskAndStatus} task
   */
  function makeNode(task) {
    const { runs } = task.status;
    let duration = 0;
    let start = Infinity;
    let end = 0;
    if (runs) {
      for (const { started, reasonResolved, resolved } of runs) {
        if (reasonResolved === 'completed') {
          const runStart = new Date(asAny(started)).valueOf();
          const runEnd = new Date(asAny(resolved)).valueOf();
          duration += runEnd - runStart;
          start = Math.min(start, runStart);
          end = Math.max(end, runEnd);
        }
      }
    }
    if (start === Infinity) {
      start = 0;
    }

    const label = task.task.tags.label ?? task.task.metadata.name;
    const taskType = getTaskType(task, 1);
    const taskType2 = getTaskType(task, 2);
    const taskType3 = getTaskType(task, 3);
    return {
      id: task.status.taskId,
      x: Math.random() * width,
      y: Math.random() * height,
      duration,
      label,
      start,
      end,
      taskType,
      taskType2,
      taskType3,
      dependencies: task.task.dependencies,
      group: getGroup(taskType, taskType2),
      task,
    };
  }

  /**
   * @typedef {ReturnType<makeNode>} Node
   */

  /** @type {Array<Node | null>} */
  const nodesMaybe = tasks.map((task) => {
    if (isTaskGraphDefinition) {
      // There are no runs, so just make the node every time.
      return makeNode(task);
    }
    const { runs } = task.status;
    if (
      !runs ||
      !runs.length ||
      !runs[0].started ||
      !runs[0].resolved ||
      // Actions aren't interesting to visualilze.
      task.task.metadata.name.startsWith('Action: ')
    ) {
      return null;
    }

    // Only run on completed runs.
    if (runs.some((run) => run.reasonResolved === 'completed')) {
      return makeNode(task);
    }
    return null;
  });

  // For some reason typescript isn't inferring the filter correctly, but this does
  // the trick.
  const nodes = nodesMaybe
    .filter((node) => node !== null)
    .map((node) => {
      if (!node) {
        throw new Error('Node found when not expected.');
      }
      return node;
    });

  /** @type {Array<number>} */
  const durations = nodes.map((node) => node.duration);
  const starts = nodes.map((node) => node.start);

  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const minStart = Math.min(...starts);
  const maxStart = Math.max(...starts);

  const linksSet = new Set();
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (node.id !== dependency && nodes.some((n) => n.id === dependency)) {
        linksSet.add(dependency + ',' + node.id);
      }
    }
  }
  const links = [...linksSet.values()].map((v) => {
    const [source, target] = v.split(',');
    return { source, target };
  });

  exposeAsGlobal('nodes', nodes);
  exposeAsGlobal('links', links);
  exposeAsGlobal('tasks', tasks);

  /**
   * @typedef {d3.SimulationNodeDatum} SimulationNodeDatum
   */

  /**
   * Work around a type definition issue.
   * @param {{ source: any, target: any }} link
   * @returns {{source: Node, target: Node}}
   */
  function asLink(link) {
    return asAny(link);
  }

  /**
   * Work around a type definition issue.
   * @param {any} node
   * @returns {Node}
   */
  function asNode(node) {
    return asAny(node);
  }

  /**
   * @param {{ source: any; target: any; }} d
   */
  function getLinkDistance(d) {
    const { source, target } = asLink(d);
    const sourceNode = nodes.find((node) => node.id === source.id);
    const targetNode = nodes.find((node) => node.id === target.id);
    if (!sourceNode) {
      throw new Error('Could not find source node.');
    }
    if (!targetNode) {
      throw new Error('Could not find source node.');
    }
    const totalDuration = maxDuration - minDuration;
    let averageDuration = 0;
    if (totalDuration > 0) {
      averageDuration =
        (sourceNode.duration + targetNode.duration) / totalDuration;
    }

    return (
      (10 + 800 * Math.sqrt(averageDuration / Math.PI)) *
        guiControls.linkSize ** 2 +
      getNodeRadius(source) +
      getNodeRadius(target)
    );
  }

  const forceLink = d3.forceLink(links).id((d) => asNode(d).id);

  const collisionForce = d3
    .forceCollide()
    .radius((d) => getNodeRadius(asNode(d)))
    .strength(0.2);

  const linkForce = forceLink.distance(getLinkDistance);

  // Create a simulation with several forces.
  const simulation = d3
    .forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody())
    .force('collision', collisionForce)
    .force(
      'forceX',
      d3
        .forceX((d) => {
          const duration = maxStart - minStart;
          const { start, taskType, taskType2 } = asNode(d);
          if (duration === 0) {
            // When there is no duration, keep this centered.
            return width * (orderingX[taskType2] ?? orderingX[taskType] ?? 0.5);
          }

          const margin = 0.2;
          // Spread out the force left to right based on the task' start time.
          return (
            width * margin +
            ((start - minStart) / duration) * (width * (1 - margin * 2))
          );
        })
        .strength(0.04),
    )
    .force(
      'forceY',
      d3
        .forceY((d) => {
          const { taskType, taskType2 } = asNode(d);
          return height * (orderingY[taskType2] ?? orderingY[taskType] ?? 0.5);
        })
        .strength(0.04),
    )
    .on('tick', () => {
      link
        .attr('x1', (d) => asLink(d).source.x)
        .attr('y1', (d) => asLink(d).source.y)
        .attr('x2', (d) => {
          const { source, target } = asLink(d);
          const radius = getNodeRadius(target) + 3;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx ** 2 + dy ** 2);
          let t = 1;
          if (dist > 0) {
            t = (dist - radius) / dist;
          }
          return source.x + t * dx;
        })
        .attr('y2', (d) => {
          const { target, source } = asLink(d);
          const radius = getNodeRadius(target) + 3;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx ** 2 + dy ** 2);
          let t = 1;
          if (dist > 0) {
            t = (dist - radius) / dist;
          }
          return source.y + t * dy;
        });

      label.attr('x', (d) => d.x).attr('y', (d) => d.y);

      node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
    });

  // Create the SVG container.
  const svg = d3
    .create('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height].join(' '))
    .attr('style', 'max-width: 100%; height: auto;');

  // Add a line for each link, and a circle for each node.
  const link = svg
    .append('g')
    .attr('stroke', '#000')
    .attr('stroke-opacity', 0.2)
    .selectAll()
    .data(links)
    .join('line')
    .attr('stroke-width', 1)
    .attr('marker-end', 'url(#arrowhead)');

  const node = svg
    .append('g')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1)
    .selectAll()
    .data(nodes)
    .join('circle')
    .attr('r', getNodeRadius)
    .attr('fill', (d) => color('' + d.group))
    .on('mouseover', (_event, _d) => {
      const d = asNode(_d);
      label.filter((labelD) => labelD.id === d.id).style('opacity', 1);
    })
    .on('mouseout', (_event, _d) => {
      const d = asNode(_d);
      label.filter((labelD) => labelD.id === d.id).style('opacity', 0);
    })
    .on('dblclick', (_event, _d) => {
      const d = asNode(_d);
      window.open(`${getServer()}/tasks/${d.id}`, '_blank');
    })
    // Function to handle right-click context menu
    .on('contextmenu', (_event, d) => {
      /** @type {PointerEvent} */
      const event = asAny(_event);
      event.preventDefault();
      const node = asNode(d);

      /**
       * @typedef {Object} Action
       * @prop {string} label
       * @prop {() => void} action
       */

      /** @type {Action[]} */
      const actions = [
        {
          label: `Open task <b>"${node.id}"</b>`,
          action() {
            window.open(`${getServer()}/tasks/${node.id}`, '_blank');
          },
        },
        {
          label: `Open task group <b>"${node.task.status.taskGroupId}"</b>`,
          action() {
            window.open(
              `${getServer()}/tasks/groups/${node.task.status.taskGroupId}`,
              '_blank',
            );
          },
        },
        {
          label: `Ignore task group <b>"${node.task.status.taskGroupId}"</b>`,
          action() {
            const ids = getIgnoredTaskGroupIds();
            ids.push(node.task.status.taskGroupId);

            const urlParams = new URLSearchParams(window.location.search);
            urlParams.set('ignoredTaskGroupIds', ids.join(','));
            changeLocation(urlParams);
          },
        },
        getMergeAction(node.taskType),
      ];
      if (node.taskType2) {
        actions.push(getMergeAction(node.taskType2));
      }
      if (node.taskType3) {
        actions.push(getMergeAction(node.taskType3));
      }
      actions.push({
        label: 'Log task data',
        action() {
          console.log(node.task);
        },
      });

      /**
       * @param {string} taskType
       */
      function getMergeAction(taskType) {
        return {
          label: `Merge <b>"${taskType}"</b>`,
          action() {
            const urlParams = new URLSearchParams(window.location.search);
            const mergesRaw = urlParams.get('mergeTaskType');
            const merges = mergesRaw ? mergesRaw.split(',') : [];
            merges.push(taskType);
            urlParams.set('mergeTaskType', merges.join(','));
            changeLocation(urlParams);
          },
        };
      }

      // Create a context menu
      d3.select('body')
        .append('div')
        .attr('class', 'context-menu')
        .style('left', event.pageX + 5 + 'px')
        .style('top', event.pageY - 5 + 'px')
        .selectAll('a')
        .data(actions)
        .enter()
        .append('a')
        .attr('href', '#')
        .attr('class', 'context-menu-item')
        .html((item) => item.label)
        .on('click', (_event, _item) => {
          /** @type {Event} */
          const event = asAny(_event);

          /** @type {Action} */
          const { action } = asAny(_item);

          event.preventDefault();
          action();
          document.querySelector('.context-menu')?.remove();
        });

      // Add an event listener to close the context menu when clicking outside of it
      d3.select('body').on('click.context-menu', function () {
        document.querySelector('.context-menu')?.remove();
        d3.select('body').on('click.context-menu', null); // Remove the click event listener
      });
    });

  // Add a drag behavior.
  const nodeDrag = d3
    .drag()
    .on('start', (event) => {
      if (!event.active) {
        // Reheat the simulation when drag starts, and fix the subject position.
        simulation.alphaTarget(0.3).restart();
      }
    })
    .on('drag', (event) => {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    })
    .on('end', (event) => {
      // Restore the target alpha so the simulation cools after dragging ends.
      if (!event.active) {
        simulation.alphaTarget(0);
      }
    });

  node.call(asAny(nodeDrag));

  const label = svg
    .selectAll(null)
    .data(nodes)
    .enter()
    .append('text')
    .text((d) => d.label)
    .attr('font-size', 12)
    .attr('dx', 15)
    .attr('dy', 4)
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('font-family', 'sans-serif')
    .style('filter', 'url(#solid)');

  svg.append('defs').html(`
      <marker id="arrowhead" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#999" />
      </marker>
    `);

  // Reorder nodes and labels
  svg.selectAll('text').raise();

  svg.append('defs').html(`
      <filter x="0" y="0" width="1" height="1" id="solid">
        <feFlood flood-color="white" result="bg" />
        <feMerge>
          <feMergeNode in="bg"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `);

  elements.graph.appendChild(ensureExists(svg.node()));
}

function handleFileDrop() {
  document.body.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.body.style.opacity = '0.5';
  });
  document.body.addEventListener('dragleave', (event) => {
    event.preventDefault();
    document.body.style.opacity = '1.0';
  });
  document.body.addEventListener('drop', async (event) => {
    document.body.style.opacity = '1.0';
    event.preventDefault();
    event.stopImmediatePropagation();

    const file = event.dataTransfer?.files[0];

    if (file && file.type === 'application/json') {
      const json = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          resolve(JSON.parse(asAny(readerEvent.target?.result)));
        };
        reader.readAsText(file);
      });
      loadTaskGraphJSON(json);
    } else {
      alert('Please drop a valid JSON file.');
    }
  });
}

function handleFileURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const taskGraph = urlParams.get('taskGraph');
  if (!taskGraph) {
    return;
  }
  try {
    new URL(taskGraph);
  } catch (error) {
    console.error('The taskgraph is not a valid URL', error);
    return;
  }

  console.log('Fetching:', taskGraph);
  fetch(taskGraph)
    .then((response) => response.json())
    .then(loadTaskGraphJSON)
    .catch((error) =>
      console.error('Failed to load the taskgraph json', error),
    );
}

/**
 * @param {number} ms
 */
function humanizeDuration(ms) {
  if (ms < 0) {
    ms = -ms;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const secondsRemainder = seconds % 60;
  const minutesRemainder = minutes % 60;
  const hoursRemainder = hours % 24;

  let result = '';

  if (days > 0) {
    result += `${days} day${days > 1 ? 's' : ''}, `;
  }
  if (hoursRemainder > 0 || days > 0) {
    result += `${hoursRemainder} hour${hoursRemainder > 1 ? 's' : ''}, `;
  }
  if (minutesRemainder > 0 || hours > 0) {
    result += `${minutesRemainder} minute${minutesRemainder > 1 ? 's' : ''}, `;
  }
  result += `${secondsRemainder} second${secondsRemainder > 1 ? 's' : ''}`;

  return result;
}

/**
 * @param {number} ms
 */
function reportHours(ms) {
  return Math.floor((ms / 1000 / 60 / 60) * 10) / 10;
}

/**
 * @param {TimeRange[]} timeRangesOrNull
 * @returns {TimeRangeNonNull[]}
 */
function mergeOverlappingTimeRanges(timeRangesOrNull) {
  /** @type {TimeRangeNonNull[]} */
  const timeRanges = [];
  for (const timeRange of timeRangesOrNull) {
    const { start, end } = timeRange;
    if (start && end) {
      timeRanges.push({ start, end });
    }
  }

  // By start, ascending start time.
  const sorted = timeRanges.sort((a, b) => a.start - b.start);

  /**
   * @type {TimeRangeNonNull[]}
   */
  const result = [];

  for (const curr of sorted) {
    if (result.length === 0) {
      // Just add the first range.
      result.push(curr);
      continue;
    }
    const prev = result.pop();
    if (!prev) {
      throw new Error('Unexpected pop');
    }
    if (curr.end <= prev.end) {
      // Current range is completely inside previous
      result.push(prev);
      continue;
    }
    // Merges overlapping (<) and contiguous (==) ranges
    if (curr.start <= prev.end) {
      // Current range overlaps previous
      result.push({ start: prev.start, end: curr.end });
      continue;
    }
    // Ranges do not overlap
    result.push(prev);
    result.push(curr);
  }

  return result;
}
