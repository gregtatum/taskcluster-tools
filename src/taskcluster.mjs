/**
 * @param {TaskGraph} taskGraph
 * @param {boolean} isMergeChunks
 * @param {string[] | null} mergeTaskTypes
 * @param {boolean} isSimplifyGraph
 * @returns {TaskAndStatus[]}
 */
export function taskGraphToTasks(
  taskGraph,
  isMergeChunks,
  mergeTaskTypes,
  isSimplifyGraph,
) {
  /** @type {TaskAndStatus[]} */
  let tasks = [];
  for (const taskDefinition of Object.values(taskGraph)) {
    /** @type {TaskStatus} */
    const status = {
      taskId: taskDefinition.task_id,
      provisionerId: 'none',
      workerType: 'none',
      taskQueueId: 'none',
      schedulerId: 'none',
      projectId: 'none',
      taskGroupId: 'none',
      deadline: 'none',
      expires: 'none',
      retriesLeft: 0,
      state: 'unscheduled',
    };
    tasks.push({ status, task: taskDefinition.task });
  }

  if (isMergeChunks) {
    tasks = mergeChunks(tasks);
    mutateAndRemoveMissingDependencies(tasks);
  }

  if (isSimplifyGraph) {
    tasks = mutateSimplifyTasks(tasks);
  }

  if (mergeTaskTypes) {
    for (const mergeTaskType of mergeTaskTypes) {
      tasks = doMergeTaskTypes(tasks, mergeTaskType);
    }
  }

  return tasks;
}

/**
 * From local storage, retain the relationships of task to group. This saves on
 * some API requests which will not change relationships.
 *
 * @returns {Record<string, string>}
 */
function getTaskToGroup() {
  const taskToGroup = localStorage.getItem('taskToGroup');
  if (!taskToGroup) {
    return {};
  }
  try {
    return JSON.parse(taskToGroup);
  } catch (error) {
    return {};
  }
}

/**
 * @param {Record<string, string>} taskToGroup
 * @param {string} taskId
 * @param {string} taskGroupId
 */
function setTaskToGroup(taskToGroup, taskId, taskGroupId) {
  taskToGroup[taskId] = taskGroupId;
  localStorage.setItem('taskToGroup', JSON.stringify(taskToGroup));
}

/**
 * TODO - Refactor into an object rather than argument list
 *
 * @param {string[]} taskGroupIds
 * @param {string} server
 * @param {boolean} isMergeChunks
 * @param {boolean} fetchDependentTasks
 * @param {string[] | null} mergeTaskTypes
 * @param {(message: string) => void} updateStatusMessage
 * @param {Set<string>} ignoredTaskGroupIds
 * @param {boolean} isSimplifyGraph
 * @returns {Promise<{ mergedTasks: TaskAndStatus[], taskGroups: TaskGroup[]} | null>}
 */
export async function getTasks(
  taskGroupIds,
  server,
  isMergeChunks,
  fetchDependentTasks,
  mergeTaskTypes,
  updateStatusMessage,
  ignoredTaskGroupIds,
  isSimplifyGraph,
) {
  console.log(`!!! getTasks`, getTasks);
  if (!taskGroupIds.length) {
    return null;
  }

  // Validate the taskGroupIds
  if (
    taskGroupIds.length &&
    taskGroupIds.some((id) => !isTaskGroupIdValid(id))
  ) {
    const p = document.createElement('p');
    p.innerText =
      'A task group id was not valid, ' + JSON.stringify(taskGroupIds);
    document.body.appendChild(p);
    throw new Error(p.innerText);
  }

  console.log('Using the following taskGroupIds', taskGroupIds);

  /** @type {Array<Promise<TaskGroup>>} */
  const taskGroupPromises = taskGroupIds.map((id) => {
    const listUrl = `${server}/api/queue/v1/task-group/${id}/list`;
    console.log('Fetching Task Group:', listUrl);
    return fetch(listUrl).then((response) => {
      if (response.ok) {
        return response.json();
      }
      response.json().then((json) => console.error(json));
      return Promise.reject('Could not fetch task.');
    });
  });

  let taskGroups = await Promise.all(taskGroupPromises);

  // Find out what task groups we are missing.
  /** @type {Set<string>} */
  const knownTaskIds = new Set();
  /** @type {Set<string>} */
  const dependencies = new Set();
  for (const { tasks } of taskGroups) {
    for (const { task, status } of tasks) {
      knownTaskIds.add(status.taskId);
      for (const id of task.dependencies) {
        dependencies.add(id);
      }
    }
  }

  const taskGroupIdsFetched = new Set(taskGroupIds);

  const taskToGroup = getTaskToGroup();

  // Filter out any ignored task groups. We'll still pull in the dependencies.
  taskGroups = taskGroups.filter(
    (taskGroup) => !ignoredTaskGroupIds.has(taskGroup.taskGroupId),
  );

  let count = 0;
  // TODO - Put this in the UI.
  const maxCount = 15;
  // Load in the dependency groups.
  for (const taskId of dependencies) {
    if (!fetchDependentTasks) {
      break;
    }
    if (knownTaskIds.has(taskId)) {
      continue;
    }
    // Mark this one as searched.
    knownTaskIds.add(taskId);

    const taskUrl = `${server}/api/queue/v1/task/${taskId}`;
    try {
      let taskGroupId = taskToGroup[taskId];
      if (!taskGroupId) {
        updateStatusMessage('Fetching dependent task groups.');
        console.log('Fetching Task for its Task Group ID:', taskUrl);
        const response = await fetch(taskUrl);
        const json = await response.json();
        if (!response.ok) {
          console.error(json);
          continue;
        }

        taskGroupId = /** @type {Task} */ (json).taskGroupId;
        setTaskToGroup(taskToGroup, taskId, taskGroupId);
      }
      if (
        taskGroupIdsFetched.has(taskGroupId) ||
        ignoredTaskGroupIds.has(taskGroupId)
      ) {
        continue;
      }
      updateStatusMessage('Fetching dependent task groups.');
      taskGroupIdsFetched.add(taskGroupId);
      const listUrl = `${server}/api/queue/v1/task-group/${taskGroupId}/list`;
      console.log('Fetching TaskGroup', listUrl);
      const response = await fetch(listUrl);
      const json = await response.json();

      if (!response.ok) {
        console.error(json);
        continue;
      }
      /** @type {TaskGroup} */
      const taskGroup = json;

      // Hold on to this new task group.
      taskGroups.push(taskGroup);

      for (const { task, status } of taskGroup.tasks) {
        knownTaskIds.add(status.taskId);
        for (const id of task.dependencies) {
          // Add on the to dependencies. The iterator will continue iterating on all
          // of the newly discovered dependencies.
          dependencies.add(id);
        }
      }

      count++;
      if (count > maxCount) {
        break;
      }
    } catch (error) {
      console.error(error);
    }
  }

  // Do a stable sort based on expires.
  taskGroups.sort(
    (a, b) => Number(new Date(a.expires)) - Number(new Date(b.expires)),
  );

  // Get all of the tasks into a flat list.

  /** @type {TaskAndStatus[]} */
  let tasks = [];
  for (const { tasks: tasksList } of taskGroups) {
    for (const task of tasksList) {
      tasks.push(task);
    }
  }

  mutateAndRemoveMissingDependencies(tasks);

  if (isSimplifyGraph) {
    tasks = mutateSimplifyTasks(tasks);
  }

  if (isMergeChunks) {
    tasks = mergeChunks(tasks);
  }

  mutateAndRemoveMissingDependencies(tasks);

  if (mergeTaskTypes) {
    for (const mergeTaskType of mergeTaskTypes) {
      tasks = doMergeTaskTypes(tasks, mergeTaskType);
    }
  }

  return { mergedTasks: tasks, taskGroups };
}

/**
 * @param {TaskAndStatus[]} tasks
 * @returns {TaskAndStatus[]}
 */
function mutateSimplifyTasks(tasks) {
  const toolchainPrefixes = new Set(['build-', 'fetch-', 'toolchain-']);

  mutateCreateMergedTask(tasks, 'toolchain', (task) => {
    const { name } = task.task.metadata;
    if (!name) {
      return false;
    }
    for (const prefix of toolchainPrefixes) {
      if (name.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  });

  // mutateCreateMergedTask(tasks, 'dataset', (task) => {
  //   const { name } = task.task.metadata;
  //   if (!name) {
  //     return false;
  //   }
  //   if (name.startsWith('dataset')) {
  //     return true;
  //   }
  //   return false;
  // });

  console.log(`!!! tasks.length before2`, tasks.length);

  tasks = mutateRemoveTaskFromGraph(tasks, (task) => {
    return task.task.metadata.name.startsWith('all-');
  });

  console.log(
    `!!! all-`,
    tasks.filter((task) => {
      return task.task.metadata.name.startsWith('all-');
    }),
  );
  console.log(`!!! tasks.length after2`, tasks.length);

  return tasks;
}

/**
 * @param {TaskAndStatus[]} tasks
 * @param {string} name
 * @param {(task: TaskAndStatus) => boolean} doesMatchCriteria
 */
function mutateCreateMergedTask(tasks, name, doesMatchCriteria) {
  let taskIdGeneration = 0;
  /** @type {TaskAndStatus | null} */
  let mergedToolchainTask = null;
  const mergedToolchainDependencies = new Set();
  const toolchainTaskIds = new Set();

  /** @type {Record<string, TaskAndStatus>} */
  const idToTask = {};
  for (const task of tasks) {
    idToTask[task.status.taskId] = task;
  }

  for (const task of tasks) {
    if (!doesMatchCriteria(task)) {
      continue;
    }

    // This is a toolchain task.
    if (!mergedToolchainTask) {
      mergedToolchainTask = createEmptyTaskAndStatus(
        name,
        `${name}-simplified` + taskIdGeneration++,
      );
      tasks.push(mergedToolchainTask);
    }
    for (const dependency of task.task.dependencies) {
      mergedToolchainDependencies.add(dependency);
    }
    toolchainTaskIds.add(task.status.taskId);
    task.task.dependencies = [mergedToolchainTask.status.taskId];
  }

  if (mergedToolchainTask) {
    // Re-map the dependencies to the merged tool.
    for (const task of tasks) {
      if (doesMatchCriteria(task)) {
        continue;
      }
      task.task.dependencies = task.task.dependencies.map((taskId) =>
        toolchainTaskIds.has(taskId)
          ? mergedToolchainTask.status.taskId
          : taskId,
      );
    }

    // Add the merged synthetic tasks.
    mergedToolchainTask.task.dependencies = Array.from(
      mergedToolchainDependencies,
    );
  }
}

/**
 * @param {TaskAndStatus[]} tasks
 * @param {(task: TaskAndStatus) => boolean} doesMatchCriteria
 * @returns {TaskAndStatus[]}
 */
function mutateRemoveTaskFromGraph(tasks, doesMatchCriteria) {
  /** @type {Set<string>} */
  const removedTaskIds = new Set();

  console.log(`!!! tasks.length before`, tasks.length);
  tasks = tasks.filter((task) => {
    if (doesMatchCriteria(task)) {
      console.log(`!!! Removing`, task);
      removedTaskIds.add(task.status.taskId);
      return false;
    }
    return true;
  });

  for (const task of tasks) {
    task.task.dependencies = task.task.dependencies.filter(
      (taskId) => !removedTaskIds.has(taskId),
    );
  }

  console.log(`!!! tasks.length after`, tasks.length);
  return tasks;
}

/**
 * @param {TaskAndStatus[]} tasks
 * @return {TaskAndStatus[]}
 */
export function mergeChunks(tasks) {
  /** @type {TaskAndStatus[]} */
  const mergedTasks = [];
  /** @type {Map<string, TaskAndStatus>} */
  const keyToMergedTask = new Map();
  /** @type {Map<string, string>} */
  const taskIdToMergedId = new Map();
  for (const task of tasks) {
    const { label } = task.task.tags;

    const chunkResult = label?.match(/(.*)-\d+\/\d+$/);
    if (chunkResult) {
      // This is a chunk that needs merging.
      const newLabel = chunkResult[1];
      const key = '(chunk)-' + newLabel;
      const mergedTask = keyToMergedTask.get(key);

      if (mergedTask) {
        // The task exists already, add the runs to it.
        taskIdToMergedId.set(task.status.taskId, mergedTask.status.taskId);

        // Merge the runs.
        mergedTask.status.runs = [
          ...(mergedTask.status.runs ?? []),
          ...(task.status.runs ?? []),
        ];
        mergedTask.task.dependencies = [
          ...new Set([
            ...mergedTask.task.dependencies,
            ...task.task.dependencies,
          ]),
        ];
      } else {
        // Create the start of a merged task.
        task.task.tags.label = newLabel;
        keyToMergedTask.set(key, task);
        mergedTasks.push(task);
      }
    } else {
      // No merging is needed.
      mergedTasks.push(task);
    }
  }

  for (const task of mergedTasks) {
    task.task.dependencies = task.task.dependencies.map(
      (id) => taskIdToMergedId.get(id) ?? id,
    );
  }

  return mergedTasks;
}

/**
 * @param {string} id
 */
export function isTaskGroupIdValid(id) {
  return id.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * @param {TaskAndStatus[]} tasks
 */
function mutateAndRemoveMissingDependencies(tasks) {
  // Figure out which taskIds are actually present.
  const presentTaskIds = new Set();
  for (const task of tasks) {
    const { taskId } = task.status;
    presentTaskIds.add(taskId);
  }

  // Remove any dependencies that aren't present.
  for (const task of tasks) {
    task.task.dependencies = task.task.dependencies.filter((id) =>
      presentTaskIds.has(id),
    );
  }
}

/**
 * @param {TaskAndStatus[]} tasks
 * @param {string} mergeTaskType
 * @return {TaskAndStatus[]}
 */
function doMergeTaskTypes(tasks, mergeTaskType) {
  /** @type {TaskAndStatus[]} */
  const mergedTasks = [];
  /** @type {Map<string, TaskAndStatus>} */
  const keyToMergedTask = new Map();
  /** @type {Map<string, string>} */
  const taskIdToMergedId = new Map();

  for (const task of tasks) {
    const { label } = task.task.tags;

    let isMerged = false;
    if (label?.startsWith(mergeTaskType + '-')) {
      // Create a key that knows about dependents.
      const key = '(taskType)-' + mergeTaskType;
      const mergedTask = keyToMergedTask.get(key);

      if (mergedTask) {
        // The task exists already, add the runs to it.
        taskIdToMergedId.set(task.status.taskId, mergedTask.status.taskId);

        // Only apply the merged label when things are merged.
        mergedTask.task.tags.label = mergeTaskType + ' (merged)';

        // Merge the runs.
        mergedTask.status.runs = [
          ...(mergedTask.status.runs ?? []),
          ...(task.status.runs ?? []),
        ];
        mergedTask.task.dependencies = [
          ...new Set([
            ...mergedTask.task.dependencies,
            ...task.task.dependencies,
          ]),
        ];
      } else {
        keyToMergedTask.set(key, task);
        mergedTasks.push(task);
      }

      isMerged = true;
    }

    if (!isMerged) {
      // No merging is needed.
      mergedTasks.push(task);
    }
  }

  for (const task of mergedTasks) {
    task.task.dependencies = task.task.dependencies.map(
      (id) => taskIdToMergedId.get(id) ?? id,
    );
  }

  return mergedTasks;
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {(task: TaskAndStatus) => boolean} filterTask
 * @returns {TimeRange[]}
 */
export function getTaskGroupTimeRanges(taskGroups, filterTask = () => true) {
  return taskGroups.map((taskGroup) => {
    /** @type {null | number} */
    let start = null;
    /** @type {null | number} */
    let end = null;
    for (const taskAndStatus of taskGroup.tasks) {
      const { runs } = taskAndStatus.status;
      if (runs && filterTask(taskAndStatus)) {
        for (const run of runs) {
          // Attempt to parse a Date. The results will be NaN on failure.
          const startedMS = new Date(
            run.started ?? run.resolved ?? '',
          ).valueOf();
          const resolvedMS = new Date(run.resolved ?? '').valueOf();

          if (!Number.isNaN(startedMS)) {
            if (start === null) {
              start = startedMS;
            } else {
              start = Math.min(start, startedMS);
            }
          }
          if (!Number.isNaN(resolvedMS)) {
            if (end === null) {
              end = resolvedMS;
            } else {
              end = Math.max(end, resolvedMS);
            }
          }
        }
      }
    }
    return { start, end };
  });
}

/**
 * @param {TaskGroup[]} taskGroups
 * @param {(task: TaskAndStatus) => boolean} filterFn
 * @returns {TimeRange[]}
 */
export function getTaskTimeRanges(taskGroups, filterFn = () => true) {
  /** @type {Array<TimeRange | null>} */
  const timeRangeOrNull = taskGroups.flatMap((taskGroup) => {
    return taskGroup.tasks.flatMap((task) => {
      if (!filterFn(task)) {
        return null;
      }
      const { runs } = task.status;
      if (!runs) {
        return [];
      }
      return runs.map((run) => {
        const start = new Date(run.started ?? run.resolved ?? '').valueOf();
        const end = new Date(run.resolved ?? '').valueOf();
        return { start, end };
      });
    });
  });

  // @ts-ignore
  return timeRangeOrNull.filter((timeRange) => timeRange);
}

/**
 * @param {string} server
 * @param {string} taskId
 * @param {string} taskStatus
 */
export async function getLiveLog(server, taskId, taskStatus) {
  // TODO - Only cache the log if it's complete.
  const key = `live-log-${taskId}`;
  if (taskStatus === 'completed') {
    const cache = localStorage.getItem(key);
    if (cache) {
      console.log(`Using cached live log for`, taskId);
      return cache;
    }
  }
  console.log(`Requesting live log for`, taskId);
  const artifactPath = 'public/logs/live.log';
  const taskUrl = `${server}/api/queue/v1/task/${taskId}/artifacts/${artifactPath}`;

  const response = fetchStreamWithDebounce(taskUrl, 1000);
  if (taskStatus === 'completed') {
    response.then((log) => {
      localStorage.setItem(key, log);
    });
  }
  return response;
}

/**
 * Fetches a stream from a URL with a debounce mechanism. If no new data is received
 * for a specified duration, the stream is closed and the partial data is returned.
 *
 * @param {string} url - The URL of the streaming endpoint.
 * @param {number} debounceTime - The debounce time in milliseconds.
 * @returns {Promise<string>} A promise that resolves with the concatenated stream data.
 */
function fetchStreamWithDebounce(url, debounceTime) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    /** @type {any} */
    let debounceTimer;
    let accumulatedData = '';

    const resetDebounceTimer = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        resolve(accumulatedData);
        controller.abort(
          'No new data in the specified debounce time. Aborting stream.',
        );
      }, debounceTime);
    };

    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.body) {
          throw new Error('ReadableStream not yet supported in this browser.');
        }

        resetDebounceTimer();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        return new ReadableStream({
          start: (streamController) => {
            const push = () => {
              reader
                .read()
                .then(({ done, value }) => {
                  if (done) {
                    streamController.close();
                    return;
                  }

                  accumulatedData += decoder.decode(value, { stream: true });
                  resetDebounceTimer();
                  streamController.enqueue(value);
                  push();
                })
                .catch((err) => {
                  streamController.error(err);
                });
            };

            push();
          },
        });
      })
      .then((stream) => {
        const reader = stream.getReader();
        reader.closed.then(() => {
          clearTimeout(debounceTimer);
          resolve(accumulatedData);
        });
      })
      .catch((error) => {
        clearTimeout(debounceTimer);
        if (error?.name === 'AbortError') {
          resolve(accumulatedData);
        } else {
          reject(error);
        }
      });
  });
}

/**
 * @param {string} name
 * @param {string} taskId
 * @returns {TaskAndStatus}
 */
function createEmptyTaskAndStatus(name, taskId) {
  return {
    status: {
      taskId,
      provisionerId: '',
      workerType: '',
      taskQueueId: '',
      schedulerId: '',
      projectId: '',
      taskGroupId: '',
      deadline: '',
      expires: '',
      retriesLeft: 0,
      state: 'unscheduled',
    },
    task: {
      provisionerId: '',
      workerType: '',
      taskQueueId: '',
      schedulerId: '',
      projectId: '',
      taskGroupId: '',
      dependencies: [],
      requires: '',
      routes: [],
      priority: '',
      retries: 0,
      created: '',
      deadline: '',
      expires: '',
      scopes: [],
      payload: {
        artifacts: [
          {
            name: 'public/build',
            path: 'artifacts',
            type: 'directory',
          },
        ],
        command: [],
      },
      metadata: {
        name,
        owner: '',
        source: '',
        description: '',
      },
      tags: {
        kind: '',
        label: name,
        createdForUser: '',
        'worker-implementation': '',
      },
      extra: {
        index: { rank: 0 },
        parent: '',
      },
    },
  };
}
