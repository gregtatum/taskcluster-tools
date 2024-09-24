import { getServer } from './utils.mjs';
import {
  fetchTaskGroup,
  getArtifactSize,
  listArtifacts,
} from './taskcluster.mjs';

/**
 * A local cached copy of taskcluster data.
 */
export class TaskclusterDB {
  /**
   * @param {IDBDatabase} db
   */
  constructor(db) {
    this.db = db;
  }

  static async open() {
    return new TaskclusterDB(await openDatabase());
  }

  /**
   * Adds a task group to the 'taskGroups' object store.
   * @param {TaskGroup} taskGroup - The task group to add to the database.
   * @returns {Promise<void>} A promise that resolves when the transaction is complete.
   */
  async addTaskGroup(taskGroup) {
    const db = await openDatabase();
    const transaction = db.transaction('taskGroups', 'readwrite');
    const store = transaction.objectStore('taskGroups');
    store.add(taskGroup);
    return awaitTransactionComplete(transaction);
  }

  /**
   * @param {ArtifactListing} artifactListing
   * @returns {Promise<void>}
   */
  async addArtifactListing(artifactListing) {
    const db = await openDatabase();
    const transaction = db.transaction('artifactListing', 'readwrite');
    const store = transaction.objectStore('artifactListing');
    store.add(artifactListing);
    return awaitTransactionComplete(transaction);
  }

  /**
   * Compute an artifact listing.
   *
   * @param {TaskAndStatus} taskAndStatus
   * @returns {Promise<ArtifactListing>}
   */
  async getArtifactListing({ task, status }) {
    const { taskId, runs } = status;

    if (!runs) {
      return {
        taskId,
        totalSize: 0,
        artifacts: [],
      };
    }
    let listingFromDB = await this.#getArtifactListingFromDB(taskId);
    if (listingFromDB) {
      console.log(`cached artifact listing ${task.metadata.name}`);
      return listingFromDB;
    }
    const server = getServer();

    /** @type {ArtifactListing} */
    const artifactListing = {
      taskId,
      totalSize: 0,
      artifacts: [],
    };

    for (const { runId } of runs) {
      const { artifacts } = await listArtifacts(server, status.taskId, runId);
      for (const { name: path } of artifacts) {
        const size = await getArtifactSize(server, status.taskId, path);
        if (size) {
          artifactListing.totalSize += size;
        }

        artifactListing.artifacts.push({
          runId,
          path,
          size,
        });
      }
    }

    await this.addArtifactListing(artifactListing);
    return artifactListing;
  }

  /**
   * @param {string} taskGroupId
   * @returns {Promise<TaskGroup | null>}
   */
  async getTaskGroup(taskGroupId) {
    {
      const taskGroup = await this.#getTaskGroupFromDB(taskGroupId);
      if (taskGroup) {
        console.log('Task group was in indexeddb', taskGroupId);
        return taskGroup;
      }
    }
    try {
      const taskGroup = await fetchTaskGroup(
        getServer(),
        taskGroupId,
        () => {},
      );
      console.log('Saving taskgroup to indexeddb', taskGroup);
      await this.addTaskGroup(taskGroup);
      return taskGroup;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * @param {string} taskGroupId
   * @returns {Promise<TaskGroup | null>}
   */
  async #getTaskGroupFromDB(taskGroupId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('taskGroups', 'readonly');
      const store = transaction.objectStore('taskGroups');
      const request = store.get(taskGroupId);

      request.onsuccess = (event) => {
        resolve(getIDBRequest(event).result);
      };

      request.onerror = (event) => {
        reject(getIDBRequest(event).error);
      };
    });
  }

  /**
   * @param {string} taskId
   * @returns {Promise<ArtifactListing | null>}
   */
  async #getArtifactListingFromDB(taskId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('artifactListing', 'readonly');
      const store = transaction.objectStore('artifactListing');
      const request = store.get(taskId);

      request.onsuccess = (event) => {
        resolve(getIDBRequest(event).result);
      };

      request.onerror = (event) => {
        reject(getIDBRequest(event).error);
      };
    });
  }
}

/**
 * Opens the IndexedDB database.
 * @returns {Promise<IDBDatabase>} A promise that resolves to the database instance.
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TaskclusterData', 1);

    request.onupgradeneeded = (event) => {
      if (!event.target) {
        return;
      }
      const db = getIDBOpenDBRequest(event).result;

      if (!db.objectStoreNames.contains('taskGroups')) {
        const taskGroupStore = db.createObjectStore('taskGroups', {
          keyPath: 'taskGroupId',
        });
        taskGroupStore.createIndex('tasks', 'tasks', { unique: true });
      }

      if (!db.objectStoreNames.contains('artifactListing')) {
        const artifactStore = db.createObjectStore('artifactListing', {
          keyPath: 'taskId',
        });
        artifactStore.createIndex('artifactListing', 'artifactListing', {
          unique: true,
        });
      }
    };

    request.onsuccess = (event) => {
      resolve(getIDBOpenDBRequest(event).result);
    };

    request.onerror = (event) => {
      reject(getIDBOpenDBRequest(event).error);
    };
  });
}

/**
 * @param {IDBTransaction} transaction
 * @returns {Promise<void>}
 */
function awaitTransactionComplete(transaction) {
  return new Promise((resolve) => {
    transaction.addEventListener('complete', () => void resolve());
  });
}

/**
 * @template T
 * @param {Event} event
 * @returns {IDBRequest<T>}
 */
function getIDBRequest(event) {
  const request = /** @type {IDBRequest<T> | null} */ (event.target);
  if (!request) {
    console.error(event);
    throw new Error('Expected to get the IDBRequest');
  }
  return request;
}

/**
 * @template T
 * @param {Event} event
 * @returns {IDBOpenDBRequest}
 */
function getIDBOpenDBRequest(event) {
  const request = /** @type {IDBOpenDBRequest | null} */ (event.target);
  if (!request) {
    console.error(event);
    throw new Error('Expected to get the IDBRequest');
  }
  return request;
}
