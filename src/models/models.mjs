main().catch((error) => {
  console.error(error);
  getById('error').style.display = 'block';
});

const aLessThanB = 'a'.localeCompare('b');
const aGreaterThanB = aLessThanB * -1;
const aEqualToB = 0;

/**
 * @param {string} id
 */
function getById(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error('Could not find element by id: ' + id);
  }
  return el;
}

async function main() {
  const url =
    'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records';
  const response = await fetch(url);

  if (!response.ok) {
    console.error(response);
    throw new Error('Response failed.');
  }

  /** @type {{ data: ModelRecord[] }} */
  const records = await response.json();
  // @ts-ignore
  window.records = records.data;
  console.log('window.records', records.data);

  /**
   * @typedef {Object} ModelEntry
   * @property {string} lang
   * @property {string} display
   * @property {ModelRecord[]} fromEn
   * @property {ModelRecord[]} toEn
   */

  /** @type {Map<string, ModelEntry>} */
  const modelsMap = new Map();
  const models = records.data.filter((record) => record.fileType === 'model');
  // @ts-ignore
  window.models = models;
  console.log('window.models', models);

  const dn = new Intl.DisplayNames('en', { type: 'language' });

  for (const model of models) {
    /** @type {ModelEntry | undefined} */
    let entry;
    if (model.fromLang === 'en') {
      entry = modelsMap.get(model.toLang);
      if (!entry) {
        entry = {
          lang: model.toLang,
          display: dn.of(model.toLang) ?? model.toLang,
          toEn: [],
          fromEn: [],
        };
      }
      entry.fromEn.push(model);
    } else {
      entry = modelsMap.get(model.fromLang);
      if (!entry) {
        entry = {
          lang: model.fromLang,
          display: dn.of(model.fromLang) ?? model.fromLang,
          toEn: [],
          fromEn: [],
        };
      }
      entry.toEn.push(model);
    }
    modelsMap.set(entry.lang, entry);
  }

  const tbody = getById('tbody');

  const modelEntries = [...modelsMap.values()].sort((a, b) =>
    `${a.lang}`.localeCompare(b.lang),
  );
  modelEntries.sort((a, b) => a.display.localeCompare(b.display));

  for (const entry of modelEntries) {
    entry.fromEn.sort((a, b) => -versionCompare(a.version, b.version));
    entry.toEn.sort((a, b) => -versionCompare(a.version, b.version));
  }

  for (const { lang, toEn, fromEn } of modelEntries) {
    const tr = document.createElement('tr');
    /**
     * @param {string} [text]
     */
    const td = (text = '') => {
      const el = document.createElement('td');
      el.innerText = text;
      tr.appendChild(el);
    };
    td(dn.of(lang));

    addToRow(td, `${lang}-en`, records.data, toEn[0]);
    addToRow(td, `en-${lang}`, records.data, fromEn[0]);
    tbody.append(tr);
  }
  getById('loading').style.display = 'none';
  getById('table').style.display = 'table';
}

/**
 * @param {(text?: string) => void} td
 * @param {string} pair
 * @param {ModelRecord[]} records
 * @param {ModelRecord} [model]
 */
function addToRow(td, pair, records, model) {
  if (model) {
    td(pair);
  } else {
    td();
  }

  td(model?.version);
  td(getModelSize(records, model));

  td(getReleaseChannel(model));
}

/**
 * @param {ModelRecord[]} records
 * @param {ModelRecord} [model]
 */
function getModelSize(records, model) {
  if (!model) {
    return '';
  }

  let size = 0;
  for (const record of records) {
    if (
      record.fromLang === model.fromLang &&
      record.toLang === model.toLang &&
      record.version === model.version &&
      record.filter_expression === model.filter_expression
    ) {
      size += Number(record.attachment.size);
    }
  }

  return (size / 1000 / 1000).toFixed(1) + ' MB';
}

/**
 * Compare two versions quickly.
 * @param {string} a
 * @param {string} b
 * @return {number}
 */
export default function versionCompare(a, b) {
  /** @type {any[]} */
  const aParts = a.split('.');
  /** @type {any[]} */
  const bParts = b.split('.');
  while (aParts.length < 3) {
    aParts.unshift('0');
  }
  while (bParts.length < 3) {
    bParts.unshift('0');
  }

  const [, aEnd, aBeta] = aParts[2].match(/(\d+)([a-z]\d?)?/) ?? [
    undefined,
    '0',
    '',
  ];
  const [, bEnd, bBeta] = bParts[2].match(/(\d+)([a-z]\d?)?/) ?? [
    undefined,
    '0',
    '',
  ];
  aParts.pop();
  bParts.pop();
  aParts.push(aEnd);
  bParts.push(bEnd);

  aParts[0] = Number(aParts[0]);
  aParts[1] = Number(aParts[1]);
  aParts[2] = Number(aParts[2]);

  bParts[0] = Number(bParts[0]);
  bParts[1] = Number(bParts[1]);
  bParts[2] = Number(bParts[2]);

  for (const part of aParts) {
    if (isNaN(part)) {
      console.error(aParts);
      throw new Error(a + ' had an NaN.');
    }
  }
  for (const part of bParts) {
    if (isNaN(part)) {
      console.error(bParts);
      throw new Error(a + ' had an NaN.');
    }
  }

  for (let i = 0; i < 3; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart > bPart) return aGreaterThanB;
    if (aPart < bPart) return aLessThanB;
  }
  if (!aBeta && !bBeta) return aEqualToB;
  if (!aBeta) return aGreaterThanB;
  if (!bBeta) return aLessThanB;

  return aBeta.localeCompare(bBeta);
}

/**
 * @param {ModelRecord} [model]
 * @returns {string}
 */
function getReleaseChannel(model) {
  if (!model) {
    return '';
  }
  let filterExpression = model.filter_expression ?? '';
  filterExpression = filterExpression.replace(
    "env.channel == 'default'",
    'Local Build',
  );
  filterExpression = filterExpression.replace(
    "env.channel == 'nightly'",
    'Nightly',
  );
  filterExpression = filterExpression.replace("env.channel == 'beta'", 'Beta');
  filterExpression = filterExpression.replace(
    "env.channel == 'release'",
    'Release',
  );
  filterExpression = filterExpression.replace(
    "env.channel == 'aurora'",
    'Aurora',
  );
  filterExpression = filterExpression.replace('||', 'or');
  filterExpression = filterExpression.replace('&&', 'and');
  if (!filterExpression) {
    filterExpression = 'All Channels';
  }
  if (model.version?.endsWith('a1')) {
    filterExpression = 'Local Build or Nightly';
  }
  return filterExpression;
}

/**
 * @param {string} a
 * @param {string} b
 * @param {number} direction
 */
function assertComparison(a, b, direction) {
  if (versionCompare(a, b) !== direction) {
    throw new Error(`Expected ${a} ${b} to compare to ${direction}`);
  }
}

assertComparison('1.0a', '1.0', aLessThanB);
assertComparison('1.0a1', '1.0', aLessThanB);
assertComparison('1.0a', '1.0a', aEqualToB);
assertComparison('0.1.0a', '1.0a', aEqualToB);
assertComparison('1.0', '1.0a', aGreaterThanB);
assertComparison('1.0', '1.0a1', aGreaterThanB);
assertComparison('1.0', '2.0', aLessThanB);
assertComparison('1.0', '1.1', aLessThanB);
assertComparison('1.0a', '1.1', aLessThanB);
