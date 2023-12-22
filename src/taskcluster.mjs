/**
 * @param {TaskGraph} taskGraph
 * @param {boolean} isMergeChunks
 * @param {string[] | null} mergeTaskTypes
 * @returns {TaskAndStatus[]}
 */
export function taskGraphToTasks(taskGraph, isMergeChunks, mergeTaskTypes) {
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
      state: 'none',
    };
    tasks.push({ status, task: taskDefinition.task });
  }

  if (isMergeChunks) {
    tasks = mergeChunks(tasks);
    mutateAndRemoveMissingDependencies(tasks);
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
) {
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

  // Get all of the tasks into a flat list.

  /** @type {TaskAndStatus[]} */
  let tasks = [];
  for (const { tasks: tasksList } of taskGroups) {
    for (const task of tasksList) {
      tasks.push(task);
    }
  }

  mutateAndRemoveMissingDependencies(tasks);

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
