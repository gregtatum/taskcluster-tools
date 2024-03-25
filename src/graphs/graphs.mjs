import { getLiveLog, getTasks, isTaskGroupIdValid } from '../taskcluster.mjs';
import { asAny, ensureExists, exposeAsGlobal, getServer } from '../utils.mjs';

// Work around ts(2686)
//   > 'd3' refers to a UMD global, but the current file is a module.
//   > Consider adding an import instead.
const d3 = window.d3;

const elements = {
  taskGroup: /** @type {HTMLInputElement} */ (getElement('taskGroup')),
  controls: getElement('controls'),
  infoMessage: getElement('info-message'),
  info: getElement('info'),
  logScale: /** @type {HTMLInputElement} */ (getElement('logScale')),
  fetchDependentTasks: /** @type {HTMLInputElement} */ (
    getElement('fetchDependentTasks')
  ),
};

setupHandlers();
init().catch((error) => {
  elements.infoMessage.innerText =
    'Failed to fetch the task. See the console for more details.';
  console.log(error);
});

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error('Could not find element ' + id);
  }
  return element;
}

function setupHandlers() {
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

  elements.fetchDependentTasks.checked = getFetchDependentTasks();
  elements.fetchDependentTasks.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set(
      'fetchDependentTasks',
      elements.fetchDependentTasks.checked.toString(),
    );
    changeLocation(urlParams);
  });

  elements.logScale.checked = getIsLogScale();
  elements.logScale.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('logScale', elements.logScale.checked.toString());
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
    elements.controls.appendChild(div);
  }
}

async function init() {
  const taskGroupIds = getTaskGroupIds();
  const server = getServer();

  const result = await getTasks(
    taskGroupIds,
    server,
    false,
    getFetchDependentTasks(),
    null,
    updateStatusMessage,
    new Set(),
  );

  if (result) {
    const { mergedTasks, taskGroups } = result;
    exposeAsGlobal('taskGroups', taskGroups);
    const trainingTasks = mergedTasks.filter(
      ({ task }) =>
        task.metadata.name.startsWith('train-teacher') ||
        task.metadata.name.startsWith('train-backwards') ||
        task.metadata.name.startsWith('train-student'),
    );
    exposeAsGlobal('trainingTasks', trainingTasks);

    updateStatusMessage('Fetching logs');
    const promises = trainingTasks.map(({ status }) => {
      if (status.runs?.length) {
        return getLiveLog(getServer(), status.taskId);
      }
      return null;
    });
    Promise.all(promises).then(
      (logs) => {
        exposeAsGlobal('logs', logs);
        render(trainingTasks, logs);
      },
      (error) => {
        console.error(error);
        updateStatusMessage('There was an error fetching the logs');
      },
    );
  } else {
    updateStatusMessage('No tasks were found.');
  }
}

/**
 * @param {TaskAndStatus[]} tasks
 * @param {Array<null | string>} logs
 */
function render(tasks, logs) {
  if (tasks.length === 0) {
    updateStatusMessage('There were no tasks in the task group');
    return;
  }
  const taskUpdates = logs.map((log) => (log ? parseLog(log) : null));
  const taskMetrics = logs.map((log) => (log ? parseMetrics(log) : null));
  exposeAsGlobal('taskUpdates', taskUpdates);
  exposeAsGlobal('taskMetrics', taskMetrics);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const updates = taskUpdates[i];
    if (!updates) {
      continue;
    }

    const runs = ensureExists(task.status.runs);
    const lastRun = runs[runs.length - 1];
    const { started, resolved } = lastRun;
    const runStart = new Date(asAny(started)).valueOf();
    const runEnd = resolved
      ? new Date(asAny(resolved)).valueOf()
      : new Date().valueOf();

    makeGraph(
      updates,
      task.task.metadata.name,
      `${getServer()}/tasks/${task.status.taskId}`,
      lastRun.state,
      runEnd - runStart,
      getIsLogScale(),
    );
    // for (const metrics of taskMetrics) {
    //   makeGraph(
    //     updates,
    //     task.task.metadata.name,
    //     `${getServer()}/tasks/${task.status.taskId}`,
    //     lastRun.state,
    //     runEnd - runStart,
    //     getIsLogScale(),
    //   )
    // }
  }

  elements.info.style.display = 'none';
}

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
 * @param {URLSearchParams} urlParams
 */
function changeLocation(urlParams) {
  const url = new URL(window.location.href);
  const newLocation = `${url.origin}${url.pathname}?${urlParams}`;

  // @ts-ignore
  window.location = newLocation;
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

/**
 * Should the graphs be in log scale?
 *
 * @returns {boolean}
 */
function getIsLogScale() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('logScale') === 'true';
}

/**
 * @param {string} message
 */
function updateStatusMessage(message) {
  elements.infoMessage.innerText = message;
}

/**
 * @typedef {Object} TrainingUpdate
 * @prop {number} cost
 * @prop {number} epoch
 * @prop {number} gnorm
 * @prop {number} rate
 * @prop {number} sen
 * @prop {number} time
 * @prop {number} up
 */

/**
 * @typedef {Object} EvalMetric
 * @prop {string} metricName
 * @prop {number} epoch
 * @prop {number} lastBest
 * @prop {number} metricValue
 * @prop {number} stallCount
 * @prop {number} update
 */

/**
 * @param {string} log
 * @returns {TrainingUpdate[]}
 */
function parseLog(log) {
  const parseLine = new RegExp(
    [
      `Ep.[ :]+(?<epoch>\\d+)[ :]+`,
      `Up.[ :]+(?<up>\\d+)[ :]+`,
      `Sen.[ :]+(?<sen>[\\d,]+)[ :]+`,
      `Cost[ :]+(?<cost>[\\d.]+)[ :]+`,
      `Time[ :]+(?<time>[\\d.]+)s[ :]+`,
      `(?<rate>[\\d.]+) words/s[ :]+`,
      `gNorm[ :]+(?<gnorm>[\\d.]+)`,
    ].join(''),
  );

  /** @type {TrainingUpdate[]} */
  const updates = [];
  for (const line of log.split('\n')) {
    const result = parseLine.exec(line);
    if (result) {
      const { cost, epoch, gnorm, rate, sen, time, up } = asAny(result.groups);
      updates.push({
        cost: parseFloat(cost), // '8.12279415',
        epoch: parseFloat(epoch), // '1',
        gnorm: parseFloat(gnorm), // '1.7667',
        rate: parseFloat(rate), // '36068.06',
        sen: parseFloat(sen), // '1,551,112',
        time: parseFloat(time), // '968.62',
        up: parseFloat(up), // '1000',
      });
    }
  }
  return updates;
}

/**
 * @param {string} log
 * @returns {Record<string, EvalMetric[]>}
 */
function parseMetrics(log) {
  const parse = new RegExp(
    [
      `Ep\\.\\s*(?<epoch>\\d+)\\s*:\\s*`,
      `Up\\.\\s*(?<update>\\d+)\\s*:\\s*`,
      `(?<metricName>[\\w-]+)\\s*:\\s*`,
      `(?<metricValue>\\d+\\.\\d+)\\s*:\\s*`,
      `stalled\\s*(?<stallCount>\\d+)\\s*times\\s*\\(last best: (?<lastBest>\\d+\\.\\d+)\\)`,
    ].join(''),
  );

  /** @type {Record<string, EvalMetric[]>} */
  const metricsRecord = {};
  for (const line of log.split('\n')) {
    const result = parse.exec(line);
    if (result) {
      const { epoch, lastBest, metricName, metricValue, stallCount, update } =
        asAny(result.groups);

      let metrics = metricsRecord[metricName] ?? [];
      metricsRecord[metricName] = metrics;

      metrics.push({
        metricName, // "bleu-detok"
        epoch: parseFloat(epoch), // "1"
        lastBest: parseFloat(lastBest), // "30.9255"
        metricValue: parseFloat(metricValue), // "30.8892"
        stallCount: parseFloat(stallCount), // "1"
        update: parseFloat(update), // "45000"
      });
    }
  }

  console.log(`!!! metricsRecord`, metricsRecord);

  return metricsRecord;
}

/**
 * Adds a title section to the graph container.
 * @param {d3.Selection} graphContainer - The D3 selection of the graph container.
 * @param {string} title - Title for the graph.
 * @param {string} link - URL to link the title to.
 * @param {string} runState - State of the run.
 * @param {number} runLengthMS - Length of the run in milliseconds.
 */
function addGraphTitle(graphContainer, title, link, runState, runLengthMS) {
  const titleSection = graphContainer
    .append('div')
    .style('display', 'flex')
    .style('align-items', 'center');
  titleSection
    .append('a')
    .attr('href', link)
    .attr('target', '_blank')
    .style('text-decoration', 'none')
    .append('h3')
    .text(title)
    .style('color', 'steelblue')
    .style('margin-right', '10px');
  titleSection
    .append('span')
    .text(`[${runState}]`)
    .style('font-weight', 'bold')
    .style('margin-right', '10px');
  titleSection
    .append('span')
    .text(`Duration: ${formatDuration(runLengthMS)}`)
    .style('font-style', 'italic');
}

/**
 * @param {TrainingUpdate[]} data
 * @param {string} title
 * @param {string} link
 * @param {string} runState
 * @param {number} runLengthMS
 * @param {boolean} logScale - Should the graph be in logScale?
 */
function makeGraph(data, title, link, runState, runLengthMS, logScale) {
  // Select the #graph container and calculate its width
  const container = d3.select('#graph');
  const containerWidth = container.node().getBoundingClientRect().width;

  // Create a new div for each graph
  const graphContainer = container.append('div');

  addGraphTitle(graphContainer, title, link, runState, runLengthMS);

  // Set the dimensions and margins of the graph
  const margin = { top: 30, right: 30, bottom: 30, left: 60 },
    width = containerWidth - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom;

  // Append the svg object to the graphContainer
  const svg = graphContainer
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Add X axis
  const x = d3
    .scaleLinear()
    .domain([0, data.length - 1])
    .range([0, width]);
  svg
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x));

  // Add Y axis with optional logarithmic scale
  const y = logScale
    ? d3
        .scaleLog()
        .domain([1, d3.max(data, (d) => d.cost)])
        .range([height, 0])
        .clamp(true)
    : d3
        .scaleLinear()
        .domain([0, d3.max(data, (d) => d.cost)])
        .range([height, 0]);
  svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')));

  // Add the line
  svg
    .append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', 1.5)
    .attr(
      'd',
      d3
        .line()
        .x((d, i) => x(i))
        .y((d) => (logScale && d.cost <= 0 ? y(1) : y(d.cost))),
    );

  // Add tooltip functionality
  addGraphTooltip(svg, data, x, y, logScale);
}

/**
 * Adds tooltip functionality to the graph.
 * @param {d3.Selection} svg - The D3 SVG selection to which the tooltip will be added.
 * @param {Object[]} data - Array of data points for the graph.
 * @param {Function} x - D3 scale function for the x-axis.
 * @param {Function} y - D3 scale function for the y-axis.
 * @param {boolean} logScale - Indicates if the graph is using a log scale.
 */
function addGraphTooltip(svg, data, x, y, logScale) {
  // Create a tooltip div
  const tooltip = d3
    .select('body')
    .append('div')
    .style('opacity', 0)
    .attr('class', 'tooltip')
    .style('pointer-events', 'none')
    .style('background-color', 'white')
    .style('border', 'solid')
    .style('border-width', '1px')
    .style('border-radius', '5px')
    .style('padding', '5px')
    .style('position', 'absolute');

  // Function to handle mouseover event
  const mouseover = function (event, d) {
    tooltip.style('opacity', 0.9);
    d3.select(this).style('stroke', 'black').style('opacity', 1);
  };

  // Function to handle mousemove event
  const mousemove = function (event, d) {
    tooltip
      .html(`Cost: ${d.cost}<br/>Epoch: ${d.epoch}`)
      .style('left', event.pageX + 10 + 'px')
      .style('top', event.pageY - 28 + 'px');
  };

  // Function to handle mouseout event
  const mouseout = function (event, d) {
    tooltip.style('opacity', 0);
    d3.select(this).style('stroke', 'none').style('opacity', 0);
  };

  // Apply tooltip to the graph
  svg
    .selectAll('.dot')
    .data(data)
    .enter()
    .append('circle')
    .attr('class', 'dot')
    .attr('cx', (d, i) => x(i))
    .attr('cy', (d) => (logScale && d.cost <= 0 ? y(1) : y(d.cost)))
    .attr('r', 5)
    .style('fill', 'steelblue')
    .style('opacity', 0) // Hidden but functional for mouseover
    .on('mouseover', mouseover)
    .on('mousemove', mousemove)
    .on('mouseout', mouseout);
}

/**
 * Converts milliseconds to a readable duration format (hours to days).
 * @param {number} milliseconds
 * @returns {string} - Formatted duration string
 */
function formatDuration(milliseconds) {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  seconds = seconds % 60;
  minutes = minutes % 60;
  hours = hours % 24;

  let duration = '';
  if (days > 0) duration += `${days}d `;
  if (hours > 0 || days > 0) duration += `${hours}h `;
  if (minutes > 0 || hours > 0 || days > 0) duration += `${minutes}m `;
  duration += `${seconds}s`;

  return duration;
}
