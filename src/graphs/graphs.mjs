import { getLiveLog, getTasks, isTaskGroupIdValid } from '../taskcluster.mjs';
import {
  asAny,
  ensureExists,
  exposeAsGlobal,
  getServer,
  getElement,
} from '../utils.mjs';

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
  metric: /** @type {HTMLSelectElement} */ (getElement('metric')),
  minNumber: /** @type {HTMLInputElement} */ (getElement('minNumber')),
  maxNumber: /** @type {HTMLInputElement} */ (getElement('maxNumber')),
};

setupHandlers();
init().catch((error) => {
  elements.infoMessage.innerText =
    'Failed to fetch the task. See the console for more details.';
  console.log(error);
});

function setupHandlers() {
  elements.taskGroup.value = getTaskGroupIds().join(',');
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

  elements.minNumber.value = '' + getMinNumber();
  elements.minNumber.addEventListener('change', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('minNumber', elements.minNumber.value);
    changeLocation(urlParams);
  });

  elements.maxNumber.value = '' + getMaxNumber();
  elements.maxNumber.addEventListener('change', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('maxNumber', elements.maxNumber.value);
    changeLocation(urlParams);
  });
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
        return getLiveLog(
          getServer(),
          status.taskId,
          status.runs[status.runs.length - 1].state,
        );
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

  const metricsKeys = new Set();
  for (const metrics of taskMetrics) {
    if (!metrics) {
      continue;
    }
    for (const key of Object.keys(metrics)) {
      metricsKeys.add(key);
    }
  }
  for (const key of [...metricsKeys].sort()) {
    const option = document.createElement('option');
    option.innerText = key;
    elements.metric.appendChild(option);
  }
  const metric = getMetric();
  if (metric) {
    elements.metric.value = metric;
  }
  elements.metric.addEventListener('change', () => {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('metric', elements.metric.value);
    changeLocation(urlParams);

    applyGraphFilter();
  });

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const metricRecords = taskMetrics[i] ?? {};
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
      updates.map((update) => update.cost),
      'cost',
      task.task.metadata.name,
      `${getServer()}/tasks/${task.status.taskId}`,
      lastRun.state,
      runEnd - runStart,
      getIsLogScale(),
    );
    for (const [key, metrics] of Object.entries(metricRecords)) {
      makeGraph(
        metrics.map((metric) => metric.metricValue),
        key,
        task.task.metadata.name,
        `${getServer()}/tasks/${task.status.taskId}`,
        lastRun.state,
        runEnd - runStart,
        getIsLogScale(),
      );
    }
  }

  // Only filter the graphs after they are built.
  applyGraphFilter();

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
 * @returns {number}
 */
function getMinNumber() {
  const urlParams = new URLSearchParams(window.location.search);
  const minNumber = parseInt(urlParams.get('minNumber') ?? '0');
  if (isNaN(minNumber)) {
    return 0;
  }
  return minNumber;
}

/**
 * @returns {number | null}
 */
function getMaxNumber() {
  const urlParams = new URLSearchParams(window.location.search);
  const maxNumber = parseInt(urlParams.get('maxNumber') ?? '0');
  if (isNaN(maxNumber) || maxNumber < getMinNumber()) {
    return null;
  }
  return maxNumber;
}

/**
 * @returns {string | null}
 */
function getMetric() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('metric');
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
  // 'Ep. 1 : Up. 5000 : bleu-detok : 1.88115 : new best';

  const parse = new RegExp(
    [
      `Ep\\.\\s*(?<epoch>\\d+)\\s*:\\s*`,
      `Up\\.\\s*(?<update>\\d+)\\s*:\\s*`,
      `(?<metricName>[\\w-]+)\\s*:\\s*`,
      `(?<metricValue>\\d+\\.\\d+)\\s*:\\s*`,
      // `stalled\\s*(?<stallCount>\\d+)\\s*times\\s*\\(last best: (?<lastBest>\\d+\\.\\d+)\\)`,
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

  return metricsRecord;
}

/**
 * Adds a title section to the graph container.
 * @param {d3.Selection<HTMLDivElement, number, Element | null, unknown>} graphContainer - The D3 selection of the graph container.
 * @param {string} metric - e.g. "bleu"
 * @param {string} title - Title for the graph.
 * @param {string} link - URL to link the title to.
 * @param {string} runState - State of the run.
 * @param {number} runLengthMS - Length of the run in milliseconds.
 * @param {number} lastValue
 */
function addGraphTitle(
  graphContainer,
  metric,
  title,
  link,
  runState,
  runLengthMS,
  lastValue,
) {
  const titleSection = graphContainer
    .append('div')
    .style('display', 'flex')
    .style('align-items', 'center');

  titleSection
    .append('a')
    .attr('href', link)
    .attr('target', '_blank')
    .attr('class', 'graph-title')
    .style('text-decoration', 'none')
    .append('h3')
    .text(title)
    .style('color', 'steelblue')
    .style('margin-right', '10px');

  titleSection
    .append('span')
    .text(runState)
    .attr('class', 'task-status')
    .style(
      'background-color',
      runState === 'completed' ? '#2e9d05' : 'steelblue',
    )
    .style('margin-right', '10px');

  titleSection
    .append('span')
    .text(`Duration: ${formatDuration(runLengthMS)}`)
    .style('font-style', 'italic')
    .style('margin-right', '10px');

  titleSection
    .append('span')
    .text(`${lastValue} - ${metric}`)
    .style('font-weight', 'bold')
    .style('flex', 1)
    .style('text-align', 'right')
    .style('margin-right', '10px');
}

/**
 * @param {number[]} data
 * @param {string} metric
 * @param {string} title
 * @param {string} link
 * @param {string} runState
 * @param {number} runLengthMS
 * @param {boolean} logScale - Should the graph be in logScale?
 */
function makeGraph(data, metric, title, link, runState, runLengthMS, logScale) {
  // Select the #graph container and calculate its width
  const container = d3.select('#graph');
  const containerWidth = asAny(container.node()).getBoundingClientRect().width;

  // Create a new div for each graph
  const graphContainer = container.append('div');
  graphContainer.attr('data-metric', metric);

  const lastValue = data[data.length - 1];
  addGraphTitle(
    graphContainer,
    metric,
    title,
    link,
    runState,
    runLengthMS,
    lastValue,
  );

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

  // Determine the minimum and maximum values for the Y-axis
  const minY = getMinNumber();
  let maxY = ensureExists(d3.max(data, (d) => d));
  const paramMaxY = getMaxNumber();
  if (paramMaxY) {
    maxY = Math.min(paramMaxY, maxY);
  }

  // Add Y axis with optional logarithmic scale
  const y = logScale
    ? d3.scaleLog().domain([minY, maxY]).range([height, 0]).clamp(true)
    : d3.scaleLinear().domain([minY, maxY]).range([height, 0]);

  svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')));

  const smoothedData = gaussianSmooth(data, 1.0);
  const transparentBlue = '#4682b4a1';

  // Add the data line.
  svg
    .append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', transparentBlue)
    .attr('stroke-width', 2)
    .attr(
      'd',
      // @ts-ignore
      d3
        .line()
        .x((d, i) => x(i))
        .y((d) => (logScale && asAny(d) <= 0 ? y(1) : y(asAny(d)))),
    );

  // Add the smoothed data line.
  svg
    .append('path')
    .datum(smoothedData)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', 2)
    .attr(
      'd',
      // @ts-ignore
      d3
        .line()
        .x((d, i) => x(i))
        .y((d) => (logScale && asAny(d) <= 0 ? y(1) : y(asAny(d)))),
    );

  // Add the area under the graph.
  svg
    .append('path')
    .datum(smoothedData)
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.2)
    .attr(
      'd',
      asAny(
        d3
          .area()
          .y0(height)
          .x(
            asAny(
              /**
               * @param {number} d
               * @param {number} i
               */
              (d, i) => x(i),
            ),
          )
          .y1(
            asAny(
              /**
               * @param {number} d
               */
              (d) => (logScale && d <= 0 ? y(1) : y(d)),
            ),
          ),
      ),
    );

  // Add tooltip functionality
  addGraphTooltip(svg, data, metric, x, y, logScale);
}

/**
 * Adds tooltip functionality to the graph.
 * @param {any} svg
 * @param {number[]} data
 * @param {string} metric - e.g. "BLEU"
 * @param {Function} x - D3 scale function for the x-axis.
 * @param {Function} y - D3 scale function for the y-axis.
 * @param {boolean} logScale - Indicates if the graph is using a log scale.
 */
function addGraphTooltip(svg, data, metric, x, y, logScale) {
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

  svg
    .selectAll('.dot')
    .data(data)
    .enter()
    .append('circle')
    .attr('class', 'dot')
    .attr(
      'cx',
      /**
       * @param {number} _d
       * @param {number} i
       */
      (_d, i) => x(i),
    )
    .attr(
      'cy',
      /**
       * @param {number} d
       */
      (d) => (logScale && d <= 0 ? y(1) : y(d)),
    )
    .attr('r', 5)
    .style('fill', 'steelblue')
    .style('opacity', 0)
    .on('mouseover', function () {
      tooltip.style('opacity', 0.9);
      // @ts-ignore
      d3.select(this).style('stroke', 'black').style('opacity', 1);
    })
    .on(
      'mousemove',
      /**
       * @param {MouseEvent} event
       * @param {number} d
       */
      function (event, d) {
        const isLeft = event.pageX > window.innerWidth * 0.66;
        tooltip
          .html(`${metric}: ${d}`)
          .style('left', isLeft ? '' : event.pageX + 10 + 'px')
          .style(
            'right',
            !isLeft ? '' : window.innerWidth - event.pageX - 10 + 'px',
          )
          .style('top', event.pageY - 28 + 'px');
      },
    )
    .on('mouseout', function () {
      tooltip.style('opacity', 0);
      // @ts-ignore
      d3.select(this).style('stroke', 'none').style('opacity', 0);
    });
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

function applyGraphFilter() {
  const metric = getMetric();
  const divs = document.querySelectorAll('[data-metric]');
  if (metric === 'all' || !metric) {
    for (const div of asAny(divs)) {
      div.display = 'block';
    }
  } else {
    for (const div of asAny(divs)) {
      div.style.display = div.dataset.metric === metric ? 'block' : 'none';
    }
  }
}

/**
 * Applies Gaussian smoothing to an array of data.
 * @param {number[]} data - The array of data to smooth.
 * @param {number} sigma - The standard deviation of the Gaussian kernel.
 * @returns {number[]} The smoothed data.
 */
function gaussianSmooth(data, sigma) {
  const gaussKernel = (x) => Math.exp(-0.5 * x * x);
  const kernelSize = Math.ceil(sigma * 3) * 2 + 1; // 3-sigma rule
  const kernelHalfSize = Math.floor(kernelSize / 2);
  const weights = Array.from({ length: kernelSize }, (_, i) =>
    gaussKernel((i - kernelHalfSize) / sigma),
  );
  const weightSum = weights.reduce((a, b) => a + b, 0);

  return data.map((_, i, arr) => {
    let smoothedValue = 0;
    for (let j = -kernelHalfSize; j <= kernelHalfSize; j++) {
      const dataIdx = Math.max(0, Math.min(arr.length - 1, i + j));
      smoothedValue += arr[dataIdx] * weights[j + kernelHalfSize];
    }
    return smoothedValue / weightSum;
  });
}
