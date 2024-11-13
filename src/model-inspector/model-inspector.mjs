import { createTableRow, getElement, replaceLocation } from '../utils.mjs';

/** @type {any} */
// @ts-ignore
const zip = window.zip;

const elements = {
  url: /** @type {HTMLInputElement} */ (getElement('url')),
  status: /** @type {HTMLDivElement} */ (getElement('status')),
  tbodyParams: /** @type {HTMLTableElement} */ (getElement('tbodyParams')),
  tbodyDetails: /** @type {HTMLTableElement} */ (getElement('tbodyDetails')),
  results: /** @type {HTMLDivElement} */ (getElement('results')),
  dropZone: /** @type {HTMLElement} */ (getElement('dropZone')),
};

/**
 * @typedef {(
 *  typeof Uint8Array
 *  | typeof Uint16Array
 *  | typeof Int8Array
 *  | typeof Int16Array
 *  | typeof Int32Array
 *  | typeof BigUint64Array
 *  | typeof BigInt64Array
 *  | typeof Float32Array
 *  | typeof Float64Array
 * )} ArrayBufferConstructors
 */

/**
 * @typedef {(
 *  Uint8Array
 *  | Uint16Array
 *  | Int8Array
 *  | Int16Array
 *  | Int32Array
 *  | BigUint64Array
 *  | BigInt64Array
 *  | Float32Array
 *  | Float64Array
 * )} ArrayBuffers
 */

/**
 * @type {Record<string, { name: string, size: number, arrayConstructor: ArrayBufferConstructors}>}
 */
const dtypes = {
  '<u1': {
    name: 'uint8',
    size: 8,
    arrayConstructor: Uint8Array,
  },
  '|u1': {
    name: 'uint8',
    size: 8,
    arrayConstructor: Uint8Array,
  },
  '<u2': {
    name: 'uint16',
    size: 16,
    arrayConstructor: Uint16Array,
  },
  '<i1': {
    name: 'int8',
    size: 8,
    arrayConstructor: Int8Array,
  },
  '|i1': {
    name: 'int8',
    size: 8,
    arrayConstructor: Int8Array,
  },
  '<i2': {
    name: 'int16',
    size: 16,
    arrayConstructor: Int16Array,
  },
  '<u4': {
    name: 'uint32',
    size: 32,
    arrayConstructor: Int32Array,
  },
  '<i4': {
    name: 'int32',
    size: 32,
    arrayConstructor: Int32Array,
  },
  '<u8': {
    name: 'uint64',
    size: 64,
    arrayConstructor: BigUint64Array,
  },
  '<i8': {
    name: 'int64',
    size: 64,
    arrayConstructor: BigInt64Array,
  },
  '<f4': {
    name: 'float32',
    size: 32,
    arrayConstructor: Float32Array,
  },
  '<f8': {
    name: 'float64',
    size: 64,
    arrayConstructor: Float64Array,
  },
};

/**
 * @param {ArrayBuffer} arrayBufferContents
 */
function parseNumpyArray(arrayBufferContents) {
  // const version = arrayBufferContents.slice(6, 8); // Uint8-encoded
  const headerLength = new DataView(arrayBufferContents.slice(8, 10)).getUint8(
    0,
  );

  const headerContents = new TextDecoder('utf-8').decode(
    new Uint8Array(arrayBufferContents.slice(10, 10 + headerLength)),
  );
  const header = JSON.parse(
    headerContents
      .toLowerCase() // True -> true
      .replace(/'/g, '"')
      .replace('(', '[')
      .replace(/,*\),*/g, ']'),
  );
  const shape = header.shape;
  const dtype = dtypes[header.descr];
  if (!dtype) {
    console.error('Header:', header);
    throw new Error(`Could not find dtype ${dtype}`);
  }

  const data = new dtype.arrayConstructor(
    arrayBufferContents,
    10 + headerLength,
  );

  return {
    dtype: dtype.name,
    data,
    shape,
    fortranOrder: header.fortran_order,
  };
}

/**
 * @param {ArrayBuffer} arrayBuffer
 */
async function readZipFile(arrayBuffer) {
  const zipReader = new zip.ZipReader(
    new zip.BlobReader(new Blob([arrayBuffer])),
  );
  const entries = await zipReader.getEntries();

  /** @type {Record<string, ReturnType<typeof parseNumpyArray>} */
  const arrays = {};
  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }
    /** @type {Uint8Array} */
    const uint8Array = await entry.getData(new zip.Uint8ArrayWriter());
    arrays[entry.filename] = parseNumpyArray(uint8Array.buffer);
  }
  readZipFile;

  return arrays;
}

document.addEventListener('DOMContentLoaded', () => {
  addDropHandlers();
  {
    const urlParams = new URLSearchParams(window.location.search);
    const url = urlParams.get('url');
    if (url) {
      console.log('URL provided', url);
      elements.url.value = url;
      requestAnimationFrame(() => {
        fetchModel(elements.url.value);
      });
    }
  }

  elements.url.addEventListener('keydown', async (event) => {
    const url = elements.url.value;
    if (event.key === 'Enter') {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('url', url);
      replaceLocation(urlParams);
      if (url) {
        fetchModel(url).catch(console.error);
      } else {
        elements.results.style.display = 'none';
      }
    }
  });
  //
});

/**
 * @param {string} url
 */
async function fetchModel(url) {
  try {
    updateStatus('Fetching model…');
    console.log('Fetching model', url);
    const response = await fetch(url);
    updateStatus('Processing model…');
    const arrayBuffer = await response.arrayBuffer();
    const { byteLength } = arrayBuffer;
    const arrays = await readZipFile(arrayBuffer);
    elements.status.style.display = 'hidden';
    displayArrays(arrays, byteLength);
  } catch (error) {
    console.error(error);
    updateStatus('Failed ' + error);
  }
}

/**
 * @param {File} file
 */
async function handleFileDrop(file) {
  try {
    updateStatus('Processing dropped model file…');
    const arrayBuffer = await file.arrayBuffer();
    const { byteLength } = arrayBuffer;
    const arrays = await readZipFile(arrayBuffer);
    elements.status.style.display = 'hidden';
    displayArrays(arrays, byteLength);
  } catch (error) {
    console.error(error);
    updateStatus('Failed ' + error);
  }
}

/**
 * @param {Record<string, ReturnType<typeof parseNumpyArray>>} arrays
 * @param {number} byteSize
 */
function displayArrays(arrays, byteSize) {
  elements.results.style.display = 'block';
  while (elements.tbodyParams.lastChild) {
    elements.tbodyParams.lastChild.remove();
  }
  while (elements.tbodyDetails.lastChild) {
    elements.tbodyDetails.lastChild.remove();
  }

  const yamlArray = arrays['special:model.yml.npy'];
  let configText = '';
  if (yamlArray) {
    const decoder = new TextDecoder('utf-8');
    configText = decoder.decode(new Uint8Array(yamlArray.data));
    if (configText.codePointAt(configText.length - 1) === 0) {
      // Remove null terminator.
      configText = configText.slice(0, configText.length - 1);
    }
  }

  let totalParameters = 0;
  let encoderParameters = 0;
  let decoderParameters = 0;
  for (const [key, { dtype, data, shape }] of Object.entries(arrays)) {
    const { createTD } = createTableRow(elements.tbodyParams);
    createTD(key);
    createTD(dtype);
    const shapeTD = createTD(JSON.stringify(shape));
    shapeTD.style.fontFamily = 'monospace';
    const button = document.createElement('button');
    button.innerText = 'Log Data';
    button.addEventListener('click', () => {
      console.log(key, data);
    });
    createTD(button);

    if (!key.startsWith('special:')) {
      let parameters = 1;
      for (const dimension of shape) {
        parameters *= dimension;
      }
      totalParameters += parameters;
      if (key.startsWith('encoder_')) {
        encoderParameters += parameters;
      }
      if (key.startsWith('decoder_')) {
        decoderParameters += parameters;
      }
    }
  }

  {
    const urlParams = new URLSearchParams(window.location.search);
    const url = urlParams.get('url');
    if (url) {
      const end = url.split('/').pop();
      const { createTD } = createTableRow(elements.tbodyDetails);
      createTD('File name');
      createTD(end);
    }
  }
  if (configText) {
    const typeMatch = configText.match(/^type:\s*(.*)$/m);
    if (typeMatch) {
      const { createTD } = createTableRow(elements.tbodyDetails);
      createTD('Model type');
      createTD(typeMatch[1]);
    }
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Model size');
    createTD(`${(byteSize / 1000 / 1000).toFixed(1)} MB`);
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Parameters');
    createTD(totalParameters.toLocaleString());
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Encoder parameters');
    createTD(encoderParameters.toLocaleString());
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Decoder parameters');
    createTD(decoderParameters.toLocaleString());
  }
  if (configText) {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Model config');
    createTD(configText);
  }

  elements.results.style.display = 'block';
  elements.status.style.display = 'none';
}

/**
 * @param {string} status
 */
function updateStatus(status) {
  elements.status.style.display = 'block';
  elements.status.innerText = status;
}

function addDropHandlers() {
  elements.dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.dropZone.style.backgroundColor = '#ccf';
  });

  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.style.backgroundColor = '';
  });

  elements.dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.dropZone.style.backgroundColor = '';
    const { dataTransfer } = event;
    if (!dataTransfer) {
      return;
    }
    const file = dataTransfer.files[0];
    if (file) {
      handleFileDrop(file);
    } else {
      updateStatus('No valid file dropped');
    }
  });
}
