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
 *  | typeof Uint32Array
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
 *  | Uint32Array
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
 * @typedef {(
 *  'uint8'
 *  | 'uint16'
 *  | 'uint32'
 *  | 'uint64'
 *  | 'int8'
 *  | 'int16'
 *  | 'int32'
 *  | 'int64'
 *  | 'float16'
 *  | 'float32'
 *  | 'float64'
 *  | 'packed16'
 *  | 'packed8avx2'
 *  | 'packed8avx512'
 *  | 'intgemm8'
 *  | 'intgemm16'
 *  | 'intgemm8ssse3'
 *  | 'intgemm8avx2'
 *  | 'intgemm8avx512'
 *  | 'intgemm8avx512vnni'
 *  | 'intgemm16sse2'
 *  | 'intgemm16avx2'
 *  | 'intgemm16avx512'
 * )} DType
 */

/**
 * @type {Record<string, { name: DType, size: number, arrayConstructor: ArrayBufferConstructors}>}
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

  /** @type {Record<string, ReturnType<typeof parseNumpyArray>>} */
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
  clearUI();
  try {
    updateStatus('Fetching model…');
    console.log('Fetching model', url);
    const response = await fetch(url);
    updateStatus('Processing model…');
    const arrayBuffer = await response.arrayBuffer();
    processUnknownArrayBuffer(arrayBuffer);
  } catch (error) {
    console.error('Could not parse as npz', error);
    updateStatus('Failed to fetch the file');
  }
}

/**
 * @param {ArrayBuffer} arrayBuffer
 */
async function processUnknownArrayBuffer(arrayBuffer) {
  try {
    const { byteLength } = arrayBuffer;
    let arrays;
    try {
      arrays = parseMarianBinaryFile(arrayBuffer);
    } catch (error) {
      console.error(`Could not parse as Marian bin file`, error);
      arrays = await readZipFile(arrayBuffer);
    }
    console.log(arrays);
    updateStatus('Determining compressed size…');
    const compressedSize = await getCompressedSize(arrayBuffer);
    elements.status.style.display = 'hidden';
    displayArrays(arrays, byteLength, compressedSize);
  } catch (error) {
    console.error(error);
    updateStatus('Failed to process the file. See the web console.');
  }
}

/**
 * @param {File} file
 */
async function handleFileDrop(file) {
  clearUI();
  try {
    updateStatus('Processing dropped model file…');
    const arrayBuffer = await file.arrayBuffer();
    processUnknownArrayBuffer(arrayBuffer);
  } catch (error) {
    console.error(error);
    updateStatus('Failed ' + error);
  }
}

/**
 * @typedef {Object} DataArrays
 * @prop {DType} dtype
 * @prop {ArrayBuffers} data
 * @prop {any} shape
 */

/**
 * @param {Record<string, DataArrays>} arrays
 * @param {number} byteSize
 * @param {number} compressedSize
 */
function displayArrays(arrays, byteSize, compressedSize) {
  elements.results.style.display = 'block';

  let configText = '';
  const yamlNumpyArray =
    arrays['special:model.yml.npy'] ?? arrays['special:model.yml'];
  if (yamlNumpyArray) {
    const decoder = new TextDecoder('utf-8');
    configText = decoder.decode(new Uint8Array(yamlNumpyArray.data));
    if (configText.codePointAt(configText.length - 1) === 0) {
      // Remove null terminator.
      configText = configText.slice(0, configText.length - 1);
    }
  }

  let totalParameters = 0;
  let encoderParameters = 0;
  let encoderBytes = 0;
  let decoderParameters = 0;
  let decoderBytes = 0;
  let embeddingsBytes = 0;
  for (const [key, { dtype, data, shape }] of Object.entries(arrays)) {
    const { createTD } = createTableRow(elements.tbodyParams);
    createTD(key);
    createTD(dtype);
    const shapeTD = createTD(JSON.stringify(shape));
    shapeTD.style.fontFamily = 'monospace';
    const button = document.createElement('button');
    button.innerText = 'Log data';
    button.title = 'Open up the DevTools web console to view the data';
    button.addEventListener('click', () => {
      console.log(key, data);
    });
    createTD(button);

    if (!key.startsWith('special:')) {
      let parameters = 1;
      for (const dimension of shape) {
        parameters *= dimension;
      }
      const dataSize = typeToSize[dtype];
      totalParameters += parameters;
      if (key.startsWith('encoder_')) {
        encoderParameters += parameters;
        encoderBytes += parameters * dataSize;
      }
      if (key.startsWith('decoder_')) {
        decoderParameters += parameters;
        decoderBytes += parameters * dataSize;
      }
      if (key == 'Wemb') {
        embeddingsBytes += parameters * dataSize;
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
    createTD(formatMB(byteSize));
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Compressed model size');
    createTD(formatMB(compressedSize));
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
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Encoder bytes');
    createTD(formatMB(encoderBytes));
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Decoder bytes');
    createTD(formatMB(decoderBytes));
  }
  {
    const { createTD } = createTableRow(elements.tbodyDetails);
    createTD('Embeddings bytes');
    createTD(formatMB(embeddingsBytes));
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
// https://github.com/marian-nmt/marian-dev/blob/a6ab8af8fc8f02c130819bfe7e07318ec958e323/src/common/types.h#L270-L286
const marianDev_typeClass = {
  signed_type: 0x00100,
  unsigned_type: 0x00200,
  float_type: 0x00400,

  avx2_type: 0x01000,
  avx512_type: 0x02000,
  sse2_type: 0x04000,
  ssse3_type: 0x08000,
  packed_type: 0x00800,
  intgemm_type: 0x10000,
  size_mask: 0x000ff,
  class_mask: 0xfff00,
};

// https://github.com/marian-nmt/marian-dev/blob/a6ab8af8fc8f02c130819bfe7e07318ec958e323/src/common/types.h#L298-L328
const marianDev_type = {
  int8: marianDev_typeClass.signed_type + 1,
  int16: marianDev_typeClass.signed_type + 2,
  int32: marianDev_typeClass.signed_type + 4,
  int64: marianDev_typeClass.signed_type + 8,

  uint8: marianDev_typeClass.unsigned_type + 1,
  uint16: marianDev_typeClass.unsigned_type + 2,
  uint32: marianDev_typeClass.unsigned_type + 4,
  uint64: marianDev_typeClass.unsigned_type + 8,

  float16: marianDev_typeClass.float_type + 2,
  float32: marianDev_typeClass.float_type + 4,
  float64: marianDev_typeClass.float_type + 8,

  packed16: marianDev_typeClass.packed_type + 2,
  packed8avx2:
    marianDev_typeClass.packed_type + 1 + marianDev_typeClass.avx2_type,
  packed8avx512:
    marianDev_typeClass.packed_type + 1 + marianDev_typeClass.avx512_type,

  intgemm8: marianDev_typeClass.intgemm_type + 1,
  intgemm16: marianDev_typeClass.intgemm_type + 2,

  intgemm8ssse3:
    marianDev_typeClass.intgemm_type + 1 + marianDev_typeClass.ssse3_type,
  intgemm8avx2:
    marianDev_typeClass.intgemm_type + 1 + marianDev_typeClass.avx2_type,
  intgemm8avx512:
    marianDev_typeClass.intgemm_type + 1 + marianDev_typeClass.avx512_type,
  intgemm8avx512vnni:
    marianDev_typeClass.intgemm_type +
    1 +
    marianDev_typeClass.avx512_type +
    4096,

  intgemm16sse2:
    marianDev_typeClass.intgemm_type + 2 + marianDev_typeClass.sse2_type,
  intgemm16avx2:
    marianDev_typeClass.intgemm_type + 2 + marianDev_typeClass.avx2_type,
  intgemm16avx512:
    marianDev_typeClass.intgemm_type + 2 + marianDev_typeClass.avx512_type,
};

const browserMT_typeClass = {
  signed_type: 0x0100,
  unsigned_type: 0x0200,
  float_type: 0x0400,

  packed_type: 0x0800,
  avx2_type: 0x1000,
  avx512_type: 0x2000,

  intgemm_type: 0x4000,

  size_mask: 0x00ff,
  class_mask: 0xff00,
};

const browserMT_type = {
  int8: browserMT_typeClass.signed_type + 1,
  int16: browserMT_typeClass.signed_type + 2,
  int32: browserMT_typeClass.signed_type + 4,
  int64: browserMT_typeClass.signed_type + 8,

  uint8: browserMT_typeClass.unsigned_type + 1,
  uint16: browserMT_typeClass.unsigned_type + 2,
  uint32: browserMT_typeClass.unsigned_type + 4,
  uint64: browserMT_typeClass.unsigned_type + 8,

  float16: browserMT_typeClass.float_type + 2,
  float32: browserMT_typeClass.float_type + 4,
  float64: browserMT_typeClass.float_type + 8,

  packed16: browserMT_typeClass.packed_type + 2, // special type for FBGEMM, not meant to be used anywhere else, not meant to be accessed invidually. Internal actual type (uint16) is meaningless.
  packed8avx2:
    browserMT_typeClass.packed_type + 1 + browserMT_typeClass.avx2_type, // special type for FBGEMM with AVX2, not meant to be used anywhere else, not meant to be accessed invidually. Internal actual type (uint8) is meaningless.
  packed8avx512:
    browserMT_typeClass.packed_type + 1 + browserMT_typeClass.avx512_type, // special type for FBGEMM with AVX512, not meant to be used anywhere else, not meant to be accessed invidually. Internal actual type (uint8) is meaningless.

  intgemm8:
    browserMT_typeClass.signed_type + 1 + browserMT_typeClass.intgemm_type, // Int8 quantized (not packed) matrices for intgemm
  intgemm16:
    browserMT_typeClass.signed_type + 2 + browserMT_typeClass.intgemm_type, // Int16 quantized (not packed) matrices for intgemm
};

/**
 * @typedef {keyof typeof browserMT_type | keyof typeof marianDev_type} Dtype
 */

/**
 * @param {number} type
 * @returns {number}
 */
function sizeOf(type) {
  const sizeMask = 0x000ff;
  return sizeMask & type;
}

const typeToConstructor = {
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  int64: BigInt64Array,

  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  uint64: BigUint64Array,

  float16: Uint8Array, // Float16Array is not supported
  float32: Float32Array,
  float64: Float64Array,

  packed16: Uint16Array,
  packed8avx2: Uint8Array,
  packed8avx512: Uint8Array,

  intgemm8: Uint8Array,
  intgemm16: Uint16Array,

  intgemm8ssse3: Uint8Array,
  intgemm8avx2: Uint8Array,
  intgemm8avx512: Uint8Array,
  intgemm8avx512vnni: Uint8Array,

  intgemm16sse2: Uint16Array,
  intgemm16avx2: Uint16Array,
  intgemm16avx512: Uint16Array,
};

/** @type {Record<DType, number>} */
const typeToSize = {
  int8: 1,
  int16: 2,
  int32: 4,
  int64: 8,

  uint8: 1,
  uint16: 2,
  uint32: 4,
  uint64: 8,

  float16: 2, // Float16Array is not supported
  float32: 4,
  float64: 8,

  packed16: 2,
  packed8avx2: 1,
  packed8avx512: 1,

  intgemm8: 1,
  intgemm16: 2,

  intgemm8ssse3: 1,
  intgemm8avx2: 1,
  intgemm8avx512: 1,
  intgemm8avx512vnni: 1,

  intgemm16sse2: 2,
  intgemm16avx2: 2,
  intgemm16avx512: 2,
};

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Record<string, DataArrays>}
 */
function parseMarianBinaryFile(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);
  let offset = 0;

  /** @type {Map<number, Dtype>} */
  const browserMT_typeMap = new Map();
  for (const [key, value] of Object.entries(browserMT_type)) {
    browserMT_typeMap.set(value, /** @type {any} */ (key));
  }
  /** @type {Map<number, Dtype>} */
  const marianDev_typeMap = new Map();
  for (const [key, value] of Object.entries(marianDev_type)) {
    marianDev_typeMap.set(value, /** @type {any} */ (key));
  }
  let typeMap = marianDev_typeMap;

  function readType() {
    const typeNumber = readUint64();
    const size = sizeOf(typeNumber);
    let type = typeMap.get(typeNumber);
    if (!type && typeMap == marianDev_typeMap) {
      // The browserMT fork has a different scheme for types around intgemm
      // that is not compatible with the upstream marian-dev. If the type isn't
      // found then switch.
      typeMap = browserMT_typeMap;
      type = typeMap.get(typeNumber);
    }
    if (!type) {
      console.table(
        Object.entries(typeMap).map(([key, value]) => [
          key,
          '0x' + value.toString(16),
        ]),
      );
      throw new Error(
        `Could not find type name for type number: 0x${typeNumber.toString(
          16,
        )}`,
      );
    }
    const constructor = typeToConstructor[type];
    if (!constructor) {
      throw new Error(`Could not find constructor for ${type}`);
    }

    return { size, typeNumber, type, constructor };
  }

  function readUint64() {
    const value = dataView.getBigUint64(offset, true);
    offset += 8;
    return Number(value);
  }

  function readInt64() {
    const value = dataView.getInt32(offset, true);
    offset += 4;
    return value;
  }

  /**
   * @param {number} size
   */
  function readString(size) {
    // Subtract one to not get the null termination.
    const bytes = new Uint8Array(arrayBuffer, offset, size - 1);
    offset += size;
    return new TextDecoder().decode(bytes);
  }

  const binaryFileVersion = readUint64();
  if (binaryFileVersion !== 1) {
    throw new Error('Unknown binary file version: ' + binaryFileVersion);
  }

  const headerSize = readUint64();
  const headers = [];
  for (let i = 0; i < headerSize; i++) {
    const nameSize = readUint64();
    const type = readType();
    const shapeSize = readUint64();
    const byteSize = readUint64();
    headers.push({
      nameSize,
      type,
      shapeSize,
      byteSize,
      // Stored after this.:
      /** @type {number[]} */
      shape: [],
      name: '',
    });
  }

  // Read the names.
  for (const header of headers) {
    const name = readString(header.nameSize);
    header.name = name;
  }

  // Read the shapes
  for (const header of headers) {
    // Read shape
    for (let i = 0; i < header.shapeSize; i++) {
      header.shape.push(readInt64());
    }
  }

  // Align to the next 256-byte boundary if needed.
  const paddingSize = (256 - (offset % 256)) % 256;
  offset += paddingSize;

  /** @type {Record<string, DataArrays>} */
  const result = {};
  for (const header of headers) {
    let items = 1;
    for (const dimension of header.shape) {
      items *= dimension;
    }
    let data;
    if (header.type.type === 'float16') {
      // This is stored as a Uint8Array, which has a different item size.
      items *= 2;
    }
    data = new header.type.constructor(arrayBuffer, offset, items);
    offset += header.byteSize;

    result[header.name] = {
      dtype: header.type.type,
      data,
      shape: header.shape,
    };
  }

  return result;
}

/**
 * @param {number} byteSize
 */
function formatMB(byteSize) {
  return `${(byteSize / 1000 / 1000).toFixed(1)} MB`;
}

/**
 * Compresses an ArrayBuffer and returns the compressed byte size.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<number>}
 */
async function getCompressedSize(arrayBuffer) {
  const blob = new Blob([arrayBuffer]);
  const zipWriter = new zip.ZipWriter(new zip.BlobWriter('application/zip'));
  await zipWriter.add('model.bin', new zip.BlobReader(blob));
  const compressedBlob = await zipWriter.close();
  return compressedBlob.size;
}

function clearUI() {
  elements.results.style.display = 'none';
  while (elements.tbodyParams.lastChild) {
    elements.tbodyParams.lastChild.remove();
  }
  while (elements.tbodyDetails.lastChild) {
    elements.tbodyDetails.lastChild.remove();
  }
}
