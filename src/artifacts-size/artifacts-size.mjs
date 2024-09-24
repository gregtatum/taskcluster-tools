// Fetch taskgroups.txt

import { TaskclusterDB } from '../taskcluster-db.mjs';
import {
  createTableRow,
  exposeAsGlobal,
  formatBytes,
  getElement,
  getLangPair,
  replaceLocation,
  zip,
} from '../utils.mjs';

// Work around ts(2686)
//   > 'd3' refers to a UMD global, but the current file is a module.
//   > Consider adding an import instead.
const d3 = window.d3;

const elements = {
  tbody: getElement('tbody'),
  storageCostRate: /** @type {HTMLInputElement} */ (
    getElement('storage-cost-rate')
  ),
  taskGroupsTextarea: /** @type {HTMLTextAreaElement} */ (
    getElement('task-groups-textarea')
  ),
  fetchButton: /** @type {HTMLButtonElement} */ (getElement('fetch-button')),
  clearCacheButton: /** @type {HTMLButtonElement} */ (
    getElement('clear-cache-button')
  ),
};

let storageRate = 0;

setupInputs();

function setupInputs() {
  const storageRateStr = window.localStorage.getItem('storage-cost-rate');
  if (storageRateStr) {
    storageRate = parseFloat(storageRateStr);
    elements.storageCostRate.value = String(storageRate);
  }
  elements.storageCostRate.addEventListener('change', () => {
    storageRate = parseFloat(elements.storageCostRate.value);
    if (isNaN(storageRate)) {
      storageRate = 0;
    } else {
      window.localStorage.setItem('storage-cost-rate', String(storageRate));
    }
  });

  elements.taskGroupsTextarea.value = getTaskGroupIds().join('\n');

  elements.taskGroupsTextarea.addEventListener('change', () => {
    setTaskGroupIds(elements.taskGroupsTextarea.value.split('\n'));
  });

  let analysisRun = false;
  elements.fetchButton.addEventListener('click', () => {
    const taskGroupIds = elements.taskGroupsTextarea.value.split('\n');
    if (analysisRun) {
      window.location.reload();
    } else {
      if (taskGroupIds.length) {
        analysisRun = true;
        runAnalysis(taskGroupIds);
        elements.fetchButton.innerText = 'Refresh to update task groups';
        console.log(`!!! elements.fetchButton`, elements.fetchButton);
      }
    }
  });

  elements.clearCacheButton.addEventListener('click', async () => {
    TaskclusterDB.delete().then(() => {
      if (confirm('Cache deleted, reload the page?')) {
        window.location.reload();
      }
    });
  });
}

/**
 * @param {string[]} taskGroupIds
 */
async function runAnalysis(taskGroupIds) {
  console.log('Running analysis');
  // shuffleArray(taskGroupIds);
  taskGroupIds = taskGroupIds.slice(0, 10);
  const taskcluster = await TaskclusterDB.open();
  exposeAsGlobal('taskcluster', taskcluster);

  for (const taskGroupId of taskGroupIds) {
    const taskGroup = await taskcluster.getTaskGroup(taskGroupId);
    if (!taskGroup) {
      continue;
    }
    const { createTD, tr } = createTableRow(elements.tbody);

    {
      const a = document.createElement('a');
      a.innerText = taskGroupId;
      a.href = `https://firefox-ci-tc.services.mozilla.com/tasks/groups/${taskGroupId}`;
      createTD(a);
    }

    {
      /** @type {string | HTMLElement} */
      let langPair = getLangPair(taskGroup.tasks);
      if (
        !langPair &&
        taskGroup.tasks.some(({ task }) =>
          task.metadata.name.startsWith('tests-'),
        )
      ) {
        langPair = document.createElement('langPair');
        langPair.style.opacity = '0.5';
        langPair.innerText = 'tests';
      }
      createTD(langPair);
    }

    createTD(String(taskGroup.tasks.length));

    const expires = new Date(taskGroup.expires);
    createTD(
      expires.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );

    /** @type {ArtifactListing[]} */
    const artifactListings = [];
    let totalSize = 0;
    let totalCount = 0;
    let totalMonthBytes = 0;
    const tdArtifactCount = createTD('0');
    const tdBytes = createTD(formatBytes(totalSize));
    const tdCost = createTD('$0.00');

    for (let i = 0; i < taskGroup.tasks.length; i++) {
      const taskAndStatus = taskGroup.tasks[i];
      const listing = await taskcluster.getArtifactListing(taskAndStatus);
      artifactListings.push(listing);
      totalCount += listing.artifacts.length;
      totalSize += listing.totalSize;
      totalMonthBytes += listing.totalMonthBytes;
      tdArtifactCount.innerText = `${totalCount} (task ${i + 1} of ${
        taskGroup.tasks.length
      })`;
      tdBytes.innerText = formatBytes(totalSize);
      tdCost.innerText =
        '$' + ((totalMonthBytes / 1_000_000_000) * storageRate).toFixed(2);
    }

    tdArtifactCount.innerText = String(totalCount);

    console.log('taskGroup', taskGroupId, taskGroup);

    {
      const button = document.createElement('button');
      let isShown = false;
      button.innerText = 'Show';
      /** @type {HTMLTableRowElement | void} */
      let graphRow;
      button.addEventListener('click', () => {
        if (isShown) {
          button.innerText = 'Show';
          if (graphRow) {
            graphRow.hidden = true;
          }
        } else {
          button.innerText = 'Hide';
          if (!graphRow) {
            graphRow = document.createElement('tr');
            const container = document.createElement('td');
            container.setAttribute('colspan', `${tr.children.length}`);
            graphRow.appendChild(container);

            container.innerText = 'Graph to go here';
            container.insertBefore;

            buildPieChart(container, taskGroup, artifactListings);

            tr.after(graphRow);
          }
          graphRow.hidden = false;
        }
        isShown = !isShown;
      });
      createTD(button);
    }
  }
}

/**
 * @param {any[]} array
 */
function shuffleArray(array) {
  for (var i = array.length - 1; i >= 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

/**
 * @param {string} name
 * @returns {string}
 */
function simplifyTaskName(name) {
  const prefixes = ['evaluate', 'dataset'];
  for (const prefix of prefixes) {
    if (name.startsWith(prefix + '-')) {
      return prefix;
    }
  }

  {
    // From: merge-translated-ru-en
    //   To: merge-translated
    const match = /^(.*)-[a-z]{2,3}-[a-z]{2,3}$/.exec(name);
    if (match) {
      return match[1];
    }
  }
  {
    // From: evaluate-teacher-flores-devtest-ru-en-1
    //   To: evaluate-teacher-flores-devtest
    const match = /^(.*)-[a-z]{2,3}-[a-z]{2,3}-\d+$/.exec(name);
    if (match) {
      return match[1];
    }
  }
  {
    // From: translate-mono-src-ru-en-2/2
    //   To: translate-mono-src
    const match = /^(.*)-[a-z]{2,3}-[a-z]{2,3}-\d+\/\d+$/.exec(name);
    if (match) {
      return match[1];
    }
  }
  return name;
}

/**
 * @param {HTMLElement} container
 * @param {TaskGroup} taskGroup
 * @param {ArtifactListing[]} artifactListings
 */
function buildPieChart(container, taskGroup, artifactListings) {
  // Set the dimensions and margins of the graph
  const width = 600;
  const height = 600;
  const margin = 80;
  const legendWidth = 400;
  const labelSpacing = 40;

  /**
   * @typedef {Object} Datum
   * @property {string} name
   * @property {number} size
   */

  /** @type {Record<string, number>} */
  const records = {};
  for (const [task, listing] of zip(taskGroup.tasks, artifactListings)) {
    const name = simplifyTaskName(task.task.metadata.name);
    records[name] = (records[name] ?? 0) + listing.totalSize;
  }

  /** @type {Datum[]} */
  const data = [];
  for (const [name, size] of Object.entries(records)) {
    data.push({ name, size });
  }

  // Sort by total size
  data.sort((a, b) => b.size - a.size);

  // Clear out any old charts
  d3.select(container).html('');

  // Append the svg object to the div called 'chart'
  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', width + legendWidth)
    .attr('height', height);

  // Set the color scale
  const color = d3
    .scaleOrdinal()
    .domain(data.map((d) => d.name))
    .range(d3.schemeSet2);

  const tooltip = d3
    .select('body')
    .append('div')
    .style('position', 'absolute')
    .style('background', 'white')
    .style('padding', '5px')
    .style('border', '1px solid black')
    .style('border-radius', '5px')
    .style('pointer-events', 'none')
    .style('opacity', 0);

  {
    // Build the pie chart.

    /**
     * D3's TypeScript types don't really work. This coerces the `d` value to the proper
     * type that is passed.
     * @type {(d: any) => PieData}
     */
    const asPieData = (d) => d;

    // Compute the position of each group on the pie
    // @ts-ignore
    const pie = d3.pie().value((d) => d.size);
    // @ts-ignore
    const pieData = pie(data);
    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const outerRadius = Math.min(width, height) / 2 - margin;
    const innerRadius = outerRadius * 0.2;

    /**
     * @typedef {Object} PieData
     * @property {Datum} data
     * @property {number} value
     * @property {number} index
     * @property {number} startAngle
     * @property {number} endAngle
     * @property {number} padAngle
     */

    const arcGenerator = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(5)
      .padAngle(0.015);

    // Build the pie chart
    g.selectAll('whatever')
      .data(pieData)
      .join('path')
      // @ts-ignore
      .attr('d', arcGenerator)
      .attr('fill', (d) => color(asPieData(d).data.name))
      .attr('stroke', '#000a')
      .style('stroke-width', '2px')
      .style('opacity', 0.7)
      .on('mouseover', (_event, d) => {
        const task = asPieData(d).data.name;
        const size = formatBytes(asPieData(d).data.size);
        tooltip
          //
          .style('opacity', 1)
          .html(`Task: ${task}<br><br>Storage: ${size}`);
      })
      .on('mousemove', function (_event) {
        // Coerce the type.
        /** @type {MouseEvent} */
        const event = /** @type {any} */ (_event);

        tooltip
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY - 15 + 'px');
      })
      .on('mouseout', function () {
        tooltip.style('opacity', 0);
      });

    // Add labels
    g.selectAll('whatever')
      .data(pieData)
      .join('text')
      .text((d) => formatBytes(asPieData(d).data.size))
      .attr('title', (d) => asPieData(d).data.name)
      .attr('transform', (d) => {
        const [x, y] = d3
          .arc()
          .innerRadius(0)
          .outerRadius(outerRadius * 2 + labelSpacing)
          // @ts-ignore
          .centroid(d);
        return `translate(${x},${y})`;
      })
      .style('text-anchor', (d) =>
        (d.endAngle + d.startAngle) / 2 > Math.PI ? 'end' : 'start',
      )
      .style('font-size', 12);
  }
  {
    // Add legend
    const g = svg
      .append('g')
      .attr('transform', `translate(${width + margin}, ${margin})`);

    const items = g
      .selectAll('legend-item')
      .data(data)
      .enter()
      .append('g')
      .attr('transform', (_d, i) => `translate(0, ${i * 20})`);

    // Legend colored squares.
    items
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 10)
      .attr('height', 10)
      .attr('fill', (d) => color(d.name));

    // Legend text.
    items
      .append('text')
      .attr('x', 20)
      .attr('y', 10)
      .text((d) => `${formatBytes(d.size)} - ${d.name}`)
      .style('font-size', 12)
      .style('text-anchor', 'start');
  }
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
 * @param {string[]} taskGroupIds
 */
function setTaskGroupIds(taskGroupIds) {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set('taskGroupIds', [...new Set(taskGroupIds)].join(','));
  replaceLocation(urlParams);
}
