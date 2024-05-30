import { isTaskGroupIdValid } from '../taskcluster.mjs';

const server = 'https://firefox-ci-tc.services.mozilla.com';

const elements = {
  taskGroup: /** @type {HTMLInputElement} */ (getElement('taskGroup')),
  loading: getElement('loading'),
  controls: getElement('controls'),
  table: getElement('table'),
  tbody: getElement('tbody'),
};

/** @type {Array<TaskGroup>} */
const taskGroups = [];
// @ts-ignore
window.taskGroups = taskGroups;
console.log('window.taskGroups', taskGroups);

/** @type {Array<TaskGroup>} */
const actionTaskGroups = [];
// @ts-ignore
window.actionTaskGroups = actionTaskGroups;
console.log('window.actionTaskGroups', actionTaskGroups);

/**
 * @param {string} id
 */
function getElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error('Could not find element by id: ' + id);
  }
  return el;
}

document.addEventListener('DOMContentLoaded', () => {
  main().catch((error) => {
    console.error(error);
    getElement('error').style.display = 'block';
  });
});

async function main() {
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

  buildTable();
}

/**
 * @param {string} taskGroupId
 * @returns {Promise<TaskGroup>}
 */
async function fetchTaskGroup(taskGroupId) {
  const listUrl = `${server}/api/queue/v1/task-group/${taskGroupId}/list`;
  const response = await fetch(listUrl);
  if (!response.ok) {
    const error = await response.json();
    console.error();
    return Promise.reject(new Error(error));
  }
  return await response.json();
}

/**
 * @param {string} taskId
 * @returns {Promise<Task>}
 */
export async function fetchTask(taskId) {
  const taskUrl = `${server}/api/queue/v1/task/${taskId}`;
  const response = await fetch(taskUrl);
  if (!response.ok) {
    const error = await response.json();
    console.error();
    return Promise.reject(new Error(error));
  }
  return await response.json();
}

/**
 * @param {string} taskId
 * @returns {Promise<TaskDependents>}
 */
async function fetchDependents(taskId) {
  const taskUrl = `${server}/api/queue/v1/task/${taskId}/dependents`;

  const response = await fetch(taskUrl);
  if (!response.ok) {
    const error = await response.json();
    console.error();
    return Promise.reject(new Error(error));
  }
  return await response.json();
}

function buildTable() {
  for (const taskGroupId of getTaskGroupIds()) {
    const listUrl = `${server}/api/queue/v1/task-group/${taskGroupId}/list`;

    console.log('Fetching Task Group:', listUrl);
    fetchTaskGroup(taskGroupId).then(
      async (actionTaskGroup) => {
        actionTaskGroups.push(actionTaskGroup);
        console.log('Action task group', actionTaskGroup);

        // Go through all of the train actions.
        for (const { task, status } of actionTaskGroup.tasks) {
          if (task.metadata.name !== 'Action: Train') {
            continue;
          }

          const tr = document.createElement('tr');

          /**
           * @param {string | Element} [textOrEl]
           * @returns {HTMLTableCellElement}
           */
          const td = (textOrEl = '') => {
            const el = document.createElement('td');
            if (typeof textOrEl === 'string') {
              el.innerText = textOrEl;
            } else {
              el.appendChild(textOrEl);
            }
            tr.appendChild(el);
            return el;
          };

          // const [dependency] = task.dependencies;
          // if (!dependency) {
          //   console.log('Train action had no dependencies yet.', task, status);
          //   td(`No tasks: ${status.taskId} ${status.state}`);
          //   continue;
          // }

          const actionTaskId = status.taskId;
          fetchDependents(actionTaskId).then(({ tasks }) => {
            const [firstTask] = tasks;
            if (!firstTask) {
              td(`${status.taskId} ${status.state}`);
            } else {
              // taskGroups.push(tasks);
              buildTableRow(td, firstTask.task.taskGroupId, tasks);
            }

            elements.tbody.appendChild(tr);
          });
        }
      },
      () => {
        console.error('Could not fetch task.', taskGroupId);
      },
    );
  }

  elements.loading.style.display = 'none';
  elements.table.style.display = 'table';
}

/**
 * @param {(text: string | Element) => HTMLTableCellElement} td
 * @param {string} taskGroupId
 * @param {TaskAndStatus[]} tasks
 */
async function buildTableRow(td, taskGroupId, tasks) {
  tasks = (await fetchTaskGroup(taskGroupId)).tasks;
  const a = document.createElement('a');
  a.innerText = taskGroupId;
  a.href = `${server}/tasks/groups/${taskGroupId}`;
  td(a);

  // Attempt to find a langpair
  let langPair = '';
  for (const { task } of tasks) {
    const match = task.metadata.name.match(/-([a-z]{2,3}-[a-z]{2,3})$/);
    if (match) {
      langPair = match[1];
      break;
    }
  }

  td(langPair);

  console.log(langPair, tasks);

  /** @type {Record<string, number>} */
  const statusCounts = {};

  for (const { status } of tasks) {
    const count = statusCounts[status.state] ?? 0;
    statusCounts[status.state] = count + 1;
  }

  const failed = (statusCounts.failed ?? 0) + (statusCounts.exception ?? 0);

  td(String(statusCounts.completed ?? 0));
  td(String(statusCounts.running ?? 0));
  const failedEl = td(String(failed));
  td(String(statusCounts.pending ?? 0));
  td(String(statusCounts.unscheduled ?? 0));

  if (failed) {
    failedEl.style.background = 'red';
    failedEl.style.color = '#fff';
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
 * @param {URLSearchParams} urlParams
 */
function changeLocation(urlParams) {
  const url = new URL(window.location.href);
  const newLocation = `${url.origin}${url.pathname}?${urlParams}`;

  // @ts-ignore
  window.location = newLocation;
}
