import { getArtifactURL } from '../taskcluster.mjs';
import { TaskclusterDB } from '../taskcluster-db.mjs';
import {
  createTableRow,
  exposeAsGlobal,
  getElement,
  changeLocation,
  formatBytes,
  combineAsyncIterators,
} from '../utils.mjs';
const server = 'https://firefox-ci-tc.services.mozilla.com';

/** @type {import("../@types/fzstd.d.ts")} */
const fzstd = /** @type {any} */ (window).fzstd;
const d3 = window.d3;

const elements = {
  taskGroup: /** @type {HTMLInputElement} */ (getElement('taskGroup')),
  error: getElement('error'),
  tbody: getElement('tbody'),
  table: /** @type {HTMLTableElement} */ (getElement('table')),
};

document.addEventListener('DOMContentLoaded', () => {
  main().catch((error) => {
    console.error(error);
    getElement('error').style.display = 'block';
  });
});

async function main() {
  const db = await TaskclusterDB.open();
  const taskGroupIds = getTaskGroupIds();
  elements.taskGroup.value = [...taskGroupIds].join(', ');
  elements.taskGroup.addEventListener('keydown', (event) => {
    const rawIds = /** @type {HTMLInputElement } */ elements.taskGroup.value;
    if (event.key === 'Enter' && rawIds) {
      const ids = rawIds.split(',').map((id) => id.trim());
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('taskGroupIds', ids.join(','));
      changeLocation(urlParams);
    }
  });

  /** @type {TaskAndStatus[]} */
  const datasetTasks = [];
  /** @type {Array<TaskGroup>} */
  const taskGroups = [];

  for (const taskGroupId of taskGroupIds) {
    const taskGroup = await db.getTaskGroup(taskGroupId);
    if (!taskGroup) {
      continue;
    }
    taskGroups.push(taskGroup);
    for (const taskAndStatus of taskGroup.tasks) {
      const { task, status } = taskAndStatus;
      if (
        status.state == 'completed' &&
        task.metadata.name.startsWith('dataset-')
      ) {
        datasetTasks.push(taskAndStatus);
      }
    }
  }

  exposeAsGlobal('taskGroups', taskGroups);
  exposeAsGlobal('datasetTasks', datasetTasks);

  buildDatasetsTable(db, datasetTasks);
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
  const taskGroupIds = new Set(taskGroupIdParam.split(','));
  return taskGroupIds;
}

/**
 * @param {TaskclusterDB} db
 * @param {TaskAndStatus[]} datasetTasks
 */
function buildDatasetsTable(db, datasetTasks) {
  /** @type {Promise<unknown>[]} */
  let listings = [];
  for (const taskAndStatus of datasetTasks) {
    const { task, status } = taskAndStatus;
    const { createTD, tr } = createTableRow(elements.tbody);
    const a = document.createElement('a');
    a.innerText = task.metadata.name;
    a.href = `https://firefox-ci-tc.services.mozilla.com/tasks/${status.taskId}`;
    createTD(a);

    const sizeTD = createTD();
    sizeTD.style.textAlign = 'right';

    const sampleButton = document.createElement('button');
    sampleButton.innerText = 'Get sample';
    sampleButton.disabled = true;

    const frequencyButton = document.createElement('button');
    frequencyButton.innerText = 'Get frequencies';
    frequencyButton.disabled = true;

    const td = createTD();
    td.appendChild(sampleButton);
    td.appendChild(frequencyButton);

    listings.push(
      db.getArtifactListing(taskAndStatus).then((listing) => {
        const datasets = listing.artifacts.filter((artifact) =>
          artifact.path.match(/\w+\.zst$/),
        );
        if (datasets.length === 0) {
          console.error('Could not find dataset for task', {
            task,
            status,
            listing,
          });
          return;
        }
        sampleButton.disabled = false;
        frequencyButton.disabled = false;

        let size = 0;
        for (const dataset of datasets) {
          if (dataset.size) {
            size += dataset.size;
          }
        }
        sizeTD.dataset.bytes = String(size);
        sizeTD.innerText = formatBytes(size);

        sampleButton.addEventListener(
          'click',
          getSampleHandler(db, tr, datasets, taskAndStatus),
        );

        frequencyButton.addEventListener(
          'click',
          analyzeFrequencyHandler(db, tr, datasets, taskAndStatus),
        );
      }),
    );
  }

  Promise.allSettled(listings).then(() => {
    sortTable(elements.table, 1, 'desc');
  });
}

/**
 * @param {HTMLElement} analyticsContainer
 */
function createAnalyticsElement(analyticsContainer) {
  const [analyticsWrapper, select] = html`
    <div class="analytics">
      <div class="analyticsLines"><span>0</span> lines scanned</div>
      <div class="analyticsPerLocale"></div>
    </div>
  `;

  analyticsContainer.appendChild(analyticsWrapper);
  return { analyticsWrapper, select };
}

/**
 * @param {TaskclusterDB} db
 * @param {HTMLTableRowElement} tr
 * @param {Artifact[]} artifacts
 * @param {TaskAndStatus} datasetTask
 */
function getSampleHandler(db, tr, artifacts, { status }) {
  let hasSample = false;
  /**
   * @param {Event} event
   */
  return async (event) => {
    event.preventDefault();
    if (!event.target) {
      return;
    }
    const { analyticsContainer, analyticsRow } =
      ensureAnalyticsContainerAdded(tr);
    const button = /** @type {HTMLInputElement} */ (event.target);

    if (hasSample) {
      if (analyticsRow.style.display === 'none') {
        analyticsRow.style.display = 'table-row';
        button.innerText = 'Hide Sample';
      } else {
        analyticsRow.style.display = 'none';
        button.innerText = 'Show Sample';
      }
      return;
    }
    hasSample = true;
    button.disabled = true;

    if (artifacts.length === 1) {
      alert('TODO - Support monolingual');
      return;
    }

    const { select } = createAnalyticsElement(analyticsContainer);
    const analyticsLineCount = /** @type {HTMLSpanElement} */ (
      select('.analyticsLines span')
    );

    const { lineTuples, artifactAFileName, artifactBFileName } =
      await getLineTuples(status, artifacts[0], artifacts[1]);

    const lines = [];

    analyticsLineCount.innerText = '0';
    const cancelUpdateLoop = runLoop(() => {
      analyticsLineCount.innerText = `${lines.length}`;
    });

    /** @type {Array<[string, string]>} */
    for await (const lineTuple of lineTuples) {
      lines.push(lineTuple);
    }

    cancelUpdateLoop();

    const sampleDiv = document.createElement('div');
    sampleDiv.className = 'sample';
    analyticsContainer.appendChild(sampleDiv);

    const headerRow = document.createElement('div');
    const headerA = document.createElement('div');
    const headerB = document.createElement('div');
    headerA.innerText = artifactAFileName;
    headerB.innerText = artifactBFileName;
    headerRow.appendChild(headerA);
    headerRow.appendChild(headerB);
    headerRow.className = 'sampleRow sampleHeader';
    sampleDiv.appendChild(headerRow);

    for (const [lineA, lineB] of shuffleArray(lines).slice(0, 500)) {
      const row = document.createElement('div');
      row.className = 'sampleRow';
      const divA = document.createElement('div');
      const divB = document.createElement('div');
      divA.innerText = lineA;
      divB.innerText = lineB;
      row.appendChild(divA);
      row.appendChild(divB);
      sampleDiv.appendChild(row);
    }

    button.disabled = false;
    button.innerText = 'Hide Sample';
  };
}

/**
 * @param {HTMLTableRowElement} tr
 */
function ensureAnalyticsContainerAdded(tr) {
  /** @type {HTMLTableCellElement} */
  let analyticsContainer;
  /** @type {HTMLTableRowElement} */
  let analyticsRow;
  if (tr.nextElementSibling?.querySelector('.analytics')) {
    analyticsContainer = /** @type {HTMLTableCellElement} */ (
      tr.nextElementSibling.querySelector('.analytics')
    );
    analyticsRow = /** @type {HTMLTableRowElement} */ (tr.nextElementSibling);
  } else {
    analyticsRow = document.createElement('tr');
    analyticsContainer = document.createElement('td');
    analyticsContainer.setAttribute(
      'colspan',
      `${tr.querySelectorAll('td').length}`,
    );
    analyticsContainer.className = 'analytics';
    analyticsRow.appendChild(analyticsContainer);
    elements.tbody.insertBefore(analyticsRow, tr.nextElementSibling);
  }

  return { analyticsContainer, analyticsRow };
}

/**
 * @param {TaskclusterDB} db
 * @param {HTMLTableRowElement} tr
 * @param {Artifact[]} artifacts
 * @param {TaskAndStatus} datasetTask
 */
function analyzeFrequencyHandler(db, tr, artifacts, { status }) {
  /**
   * @param {Event} event
   */
  return async (event) => {
    if (!event.target) {
      return;
    }
    const button = /** @type {HTMLInputElement} */ (event.target);
    button.disabled = true;

    const { analyticsContainer } = ensureAnalyticsContainerAdded(tr);

    if (artifacts.length === 1) {
      alert('Monolingual data is currently not supported');
      return;
    }

    const { select } = createAnalyticsElement(analyticsContainer);
    const analyticsPerLocale = select('.analyticsPerLocale');
    const analyticsLineCount = /** @type {HTMLSpanElement} */ (
      select('.analyticsLines span')
    );

    const { lineTuples, localeA, localeB } = await getLineTuples(
      status,
      artifacts[0],
      artifacts[1],
    );

    const analyticsA = new Analytics(localeA);
    const analyticsB = new Analytics(localeB);

    let lineLength = 0;
    analyticsLineCount.innerText = '0';
    const cancelUpdateLoop = runLoop(() => {
      analyticsLineCount.innerText = `${lineLength}`;
    });

    /** @type {Array<[string, string]>} */
    for await (const lineTuple of lineTuples) {
      analyticsA.analyze(lineTuple[0]);
      analyticsB.analyze(lineTuple[1]);
      lineLength++;
    }

    cancelUpdateLoop();

    analyticsA.applyView(/** @type {HTMLDivElement} */ (analyticsPerLocale));
    analyticsB.applyView(/** @type {HTMLDivElement} */ (analyticsPerLocale));
  };
}

/**
 * @param {TaskStatus} status
 * @param {Artifact} artifactA
 * @param {Artifact} artifactB
 */
async function getLineTuples(status, artifactA, artifactB) {
  const urlA = getArtifactURL(server, status.taskId, artifactA.path);
  const urlB = getArtifactURL(server, status.taskId, artifactB.path);

  const lineTuples = combineAsyncIterators(
    await fetchAndDecompressStream(urlA),
    await fetchAndDecompressStream(urlB),
  );

  const localeAMatch = artifactA.path.match(/(\w+)\.zst$/);
  const localeBMatch = artifactB.path.match(/(\w+)\.zst$/);
  if (!localeAMatch || !localeBMatch) {
    console.error('Could not find a locale for the artifacts', {
      artifactA,
      artifactB,
    });
    throw new Error('Could not find a locale for the artifacts');
  }
  const localeA = localeAMatch[1];
  const localeB = localeBMatch[1];

  const artifactAParts = artifactA.path.split('/');
  const artifactAFileName = artifactAParts[artifactAParts.length - 1];
  const artifactBParts = artifactB.path.split('/');
  const artifactBFileName = artifactBParts[artifactAParts.length - 1];

  return { lineTuples, localeA, localeB, artifactAFileName, artifactBFileName };
}

/**
 * @param {string} url
 * @returns {Promise<AsyncIterable<string>>}
 */
async function fetchAndDecompressStream(url) {
  console.log('Beginning to stream', url);
  const response = await fetch(url);
  if (!response.body) {
    throw new Error('No response was found for ' + url);
  }

  const reponseBody = response.body.getReader();
  const zstDecompressor = new fzstd.Decompress();
  const decoder = new TextDecoder();

  let textBuffer = '';
  let isDecompressionDone = false;

  zstDecompressor.ondata = (chunk, final) => {
    const nextTextChunk = decoder.decode(chunk, { stream: !final });
    textBuffer += nextTextChunk;
  };

  const getNextLine = () => {
    const nextNewLineIndex = textBuffer.indexOf('\n');
    if (nextNewLineIndex === -1) {
      return null;
    }

    const line = textBuffer.slice(0, nextNewLineIndex);
    textBuffer = textBuffer.slice(nextNewLineIndex + 1);
    return line;
  };

  /** @type {Promise<unknown> | null} */
  let pendingDecompression = null;

  const decompressMoreText = async () => {
    const { done, value } = await reponseBody.read();
    zstDecompressor.push(value ?? new Uint8Array(0), done);
    isDecompressionDone = done;
    pendingDecompression = null;
    // ondata should fire synchronously
  };

  const iter = {
    async next() {
      // await new Promise((resolve) => setTimeout(resolve, 0));
      // log({ isDecompressionDone, pendingDecompression });
      while (!isDecompressionDone || textBuffer) {
        if (!pendingDecompression && !isDecompressionDone) {
          // There is no pending decompression, always have one going in the background.
          pendingDecompression = decompressMoreText();
        }

        // First try and get text that has already been read.
        const nextLine = getNextLine();
        if (nextLine !== null) {
          // A line has been found, output it to the iterator.
          return { value: nextLine, done: false };
        }
        // There are no more lines to be had, time to wait for the decompression.
        await pendingDecompression;
      }

      // Output the last text, which did not have a final line terminator.
      if (textBuffer) {
        return { value: textBuffer, done: false };
      }

      // Signal that the iterator is done.
      return { value: '', done: true };
    },
    [Symbol.asyncIterator]() {
      return iter;
    },
  };

  return iter;
}

/**
 * Randomize array in-place using Durstenfeld shuffle algorithm
 *
 * @template T
 * @param {Array<T>} array
 * @returns {Array<T>}
 */
function shuffleArray(array) {
  const random = seededRandom(12345);
  for (let i = array.length - 1; i >= 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Seeded random number generator.
 * @param {number} seed - The seed value to initialize the generator.
 * @returns {function} - A function that generates a pseudo-random number between 0 and 1.
 */
function seededRandom(seed) {
  let current = seed % 2147483647;
  if (current <= 0) current += 2147483646;

  return () => {
    current = (current * 16807) % 2147483647;
    return (current - 1) / 2147483646;
  };
}

/**
 * @param {Function} fn
 */
function runLoop(fn) {
  let id = 0;
  const loop = () => {
    fn();
    id = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(id);
    fn();
  };
}

/**
 * @param {TemplateStringsArray} stringsArray
 * @returns {[Element, (selector: string) => Element]}
 */
function html(stringsArray) {
  if (stringsArray.length !== 1) {
    throw new Error('This does not support ${} style variables.');
  }
  const [text] = stringsArray;
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  if (doc.children.length !== 1) {
    throw new Error('Expected only 1 child node for the document');
  }
  const element = doc.body.firstElementChild;
  if (!element) {
    throw new Error('No elements were parsed.');
  }
  /**
   * @param {string} selector
   */
  const select = (selector) => {
    const childElement = element.querySelector(selector);
    if (!childElement) {
      throw new Error(`Could not find ${selector}`);
    }
    return childElement;
  };

  return [element, select];
}

/**
 * A class for computing and managing a numerical distribution.
 */
class Distribution {
  /** @type {number[]} */
  values = [];
  isSorted = true;

  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Adds a number to the distribution.
   * @param {number} value
   */
  add(value) {
    this.isSorted = false;
    this.values.push(value);
  }

  /**
   * Computes the mean (average) of the distribution.
   * @returns {number}
   */
  mean() {
    if (this.values.length === 0) {
      return 0;
    }
    let sum = 0;
    for (const value of this.values) {
      sum += value;
    }
    return sum / this.values.length;
  }

  /**
   * Computes a specified percentile of the distribution.
   * @param {number} p
   * @returns {number}
   */
  percentile(p) {
    if (!this.isSorted) {
      this.isSorted = true;
      this.values.sort((a, b) => a - b);
    }

    if (p < 0 || p > 1) {
      throw new RangeError('Percentile must be between 0 and 1');
    }
    if (this.values.length === 0) {
      throw new Error('No values in the distribution');
    }

    const index = (this.values.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return this.values[lower];
    }

    return this.values[lower] * (1 - weight) + this.values[upper] * weight;
  }

  /**
   * Computes the median of the distribution.
   * @returns {number}
   */
  median() {
    if (this.values.length === 0) {
      throw new Error('No values in the distribution');
    }
    const mid = Math.floor(this.values.length / 2);
    if (this.values.length % 2 === 0) {
      return (this.values[mid - 1] + this.values[mid]) / 2;
    }
    return this.values[mid];
  }

  /**
   * Computes the percentage of total values that are equal to a given number.
   * @param {number} target - The number to check.
   * @returns {number} - The percentage of values equal to the target.
   */
  percentageOf(target) {
    if (typeof target !== 'number') {
      throw new TypeError('Target must be a number');
    }
    if (this.values.length === 0) {
      throw new Error('No values in the distribution');
    }
    const count = this.values.filter((value) => value === target).length;
    return (count / this.values.length) * 100;
  }

  /**
   * Build a D3 histogram
   * @param {HTMLElement} container
   */
  chart(container) {
    const title = document.createElement('h2');
    title.innerText = this.name;
    container.appendChild(title);

    // Define dimensions and margins
    const width = 500;
    const height = 200;
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };

    // Create SVG element
    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const chart = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Define x scale (logarithmic)
    const x = d3
      .scaleLog()
      // @ts-ignore
      .domain([d3.min(this.values), d3.max(this.values)])
      .range([0, chartWidth]);

    // Define bins for histogram
    const bins = d3
      .histogram()
      // @ts-ignore
      .domain(x.domain())
      .thresholds(x.ticks(10))
      .value((d) => d)(this.values);

    // Define y scale
    const y = d3
      .scaleLinear()
      // @ts-ignore
      .domain([0, d3.max(bins, (d) => d.length)])
      .range([chartHeight, 0]);

    // Add x-axis
    chart
      .append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(x).ticks(10, '.1s'))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Add y-axis
    chart.append('g').call(d3.axisLeft(y));

    // Add bars
    chart
      .selectAll('rect')
      .data(bins)
      .enter()
      .append('rect')
      // @ts-ignore
      .attr('x', (d) => x(d.x0))
      // @ts-ignore
      .attr('y', (d) => y(d.length))
      // @ts-ignore
      .attr('width', (d) => x(d.x1) - x(d.x0) - 1) // Adjust width for gaps
      // @ts-ignore
      .attr('height', (d) => chartHeight - y(d.length))
      .attr('fill', 'steelblue');

    // Add axis labels
    chart
      .append('text')
      .attr('x', chartWidth / 2)
      .attr('y', chartHeight + margin.bottom - 5)
      .style('text-anchor', 'middle')
      .text('Values');

    chart
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -chartHeight / 2)
      .attr('y', -margin.left + 15)
      .style('text-anchor', 'middle')
      .text('Frequency');
  }
}

class Analytics {
  /**
   * @param {string} locale
   */
  constructor(locale) {
    this.locale = locale;

    this.wordSegmenter = new Intl.Segmenter(locale, {
      granularity: 'word',
    });
    this.graphemeSegmenter = new Intl.Segmenter(locale, {
      granularity: 'grapheme',
    });
    this.sentenceSegmenter = new Intl.Segmenter(locale, {
      granularity: 'sentence',
    });

    this.wordDistribution = new Distribution('Count of words per line');
    this.graphemeDistribution = new Distribution('Count of graphemes per line');
    this.sentenceDistribution = new Distribution('Count of sentences per line');
  }

  /**
   * @param {string} line
   */
  analyze(line) {
    this.wordDistribution.add(countSegments(this.wordSegmenter.segment(line)));
    this.graphemeDistribution.add(
      countSegments(this.graphemeSegmenter.segment(line)),
    );
    this.sentenceDistribution.add(
      countSegments(this.sentenceSegmenter.segment(line)),
    );
  }

  /**
   * @param {HTMLElement} container
   */
  applyView(container) {
    const [rootElement, select] = html`
      <div>
        <div class="analyticsWords"></div>
        <div class="analyticsGraphemes"></div>
        <div class="analyticsSentences"></div>
      </div>
    `;

    this.wordDistribution.chart(
      /** @type {HTMLDivElement} */ (select('.analyticsWords')),
    );
    this.graphemeDistribution.chart(
      /** @type {HTMLDivElement} */ (select('.analyticsGraphemes')),
    );
    this.sentenceDistribution.chart(
      /** @type {HTMLDivElement} */ (select('.analyticsSentences')),
    );

    container.appendChild(rootElement);
  }
}

/**
 * @param {Intl.Segments} segments
 * @returns {number}
 */
function countSegments(segments) {
  const iter = segments[Symbol.iterator]();
  let count = 0;
  while (!iter.next().done) {
    count++;
  }
  return count;
}

/**
 * Kind of a hacky function to sort a table based on a column and index.
 * @param {HTMLTableElement} table
 * @param {number} columnIndex
 */
function sortTable(table, columnIndex, dir = 'asc') {
  let switchCount = 0;
  let shouldSwitch = false;
  let switching = true;
  while (switching) {
    switching = false;
    // @ts-ignore
    const rows = table.rows;

    let i;
    for (i = 1; i < rows.length - 1; i++) {
      shouldSwitch = false;

      const x = Number(
        rows[i].querySelectorAll('td')[columnIndex]?.dataset.bytes ?? '0',
      );

      const y = Number(
        rows[i + 1].querySelectorAll('td')[columnIndex]?.dataset.bytes ?? '0',
      );

      if (dir == 'asc') {
        if (x > y) {
          shouldSwitch = true;
          break;
        }
      } else if (dir == 'desc') {
        if (x < y) {
          shouldSwitch = true;
          break;
        }
      }
    }

    if (shouldSwitch) {
      rows[i].parentNode?.insertBefore(rows[i + 1], rows[i]);
      switching = true;
      switchCount++;
    } else {
      if (switchCount == 0 && dir == 'asc') {
        dir = 'desc';
        switching = true;
      }
    }
  }
}
