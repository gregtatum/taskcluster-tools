// @ts-check

/**
 * @param {any[]} args
 */
function log(...args) {
  console.log("%c[fxp-taskcluster]%c", "color: #0ff", "color: inherit", ...args)
}

log(`background.js`);

browser.runtime.onMessage.addListener(onMessage);

/**
 * @param {{ name: string }} message
 * @param {any} sender
 * @param {any} sendReply
 */
function onMessage(message, sender, sendReply) {
  switch (message.name) {
    case "open-taskgroup-in-profiler": {
      openTaskGroup()
      break;
    }
  }
}

/**
   * @param {any} error
   */
function reportError(error) {
  // TODO - Report this in the UI.
  log(error)
}

async function openTaskGroup() {
  const [tab] = await browser.tabs.query({active: true, lastFocusedWindow: true});
  if (!tab) {
    reportError("Unable to get an active tab.")
    return;
  }
  if (!tab.url) {
    reportError("The active tab had no URL.")
    return;
  }
  let url;
  try {
    url = new URL(tab.url);
  } catch (error) {
    reportError("Could not parse the URL: " + tab.url)
    return;
  }

  const results = url.pathname.match(/^\/tasks\/groups\/([a-zA-Z0-9_-]+)\b/)
  if (!results) {
    reportError("Could not find a task group in the path: " + url.pathname)
    return;
  }
  const [,taskGroupId] = results;

  const api = `${url.protocol}//${url.host}/api/queue/v1/task-group/${taskGroupId}/list`;

  /** @type {TaskGroup} */
  let taskGroup;
  try {
    const response = await fetch(api)
    taskGroup = await response.json();
  } catch (error) {
    log("Taskcluster API error", error);
    reportError("Unable to fetch the Taskcluster API.");
    return;
  }

  log(taskGroup)


  const profilerTab = await browser.tabs.create({url: "https://profiler.firefox.com/from-post-message/"})
  // const profilerTab = await browser.tabs.create({url: "http://localhost:4242/from-post-message/"})
  await browser.tabs.executeScript({
    file: "src/profiler_content.js"
    // code: `console.log('Injected script:', window.location.href);`,
  })
  if (!profilerTab.id) {
    reportError("Could not find profiler tab ID");
    return;
  }
  browser.tabs.sendMessage(profilerTab.id, {
    name: "inject-profile",
    profile: getProfile(taskGroup, url)
  })
  // https://firefox-ci-tc.services.mozilla.com/tasks/groups/Fo1npr9eTFqsAj4DFlqBbA
}

/**
 * @param {TaskGroup} taskGroup
 * @param {URL} url
 * @returns {any}
 */
function getProfile(taskGroup, url) {
  const profileString = '{"meta":{"interval":1000,"startTime":0,"processType":0,"product":"Taskcluster","stackwalk":0,"version":27,"preprocessedProfileVersion":47,"physicalCPUs":0,"logicalCPUs":0,"symbolicationNotSupported":true,"markerSchema":[],"usesOnlyOneStackType":true},"libs":[],"threads":[{"processType":"default","processName":"Taskcluster","processStartupTime":0,"processShutdownTime":null,"registerTime":0,"unregisterTime":null,"pausedRanges":[],"name":"","isMainThread":false,"pid":"0","tid":0,"samples":{"weightType":"samples","weight":null,"stack":[],"time":[],"length":0},"markers":{"data":[],"name":[],"startTime":[],"endTime":[],"phase":[],"category":[],"length":0},"stackTable":{"frame":[0],"prefix":[null],"category":[0],"subcategory":[0],"length":1},"frameTable":{"address":[-1],"inlineDepth":[0],"category":[null],"subcategory":[0],"func":[0],"nativeSymbol":[null],"innerWindowID":[0],"implementation":[null],"line":[null],"column":[null],"length":1},"funcTable":{"isJS":[false],"relevantForJS":[false],"name":[0],"resource":[-1],"fileName":[null],"lineNumber":[null],"columnNumber":[null],"length":1},"resourceTable":{"lib":[],"name":[],"host":[],"type":[],"length":0},"nativeSymbols":{"libIndex":[],"address":[],"name":[],"functionSize":[],"length":0}}],"counters":[]}';
  const profile = JSON.parse(profileString);

  log(taskGroup)
  const sortedTasks = taskGroup.tasks.map(task => {
    const { runs } = task.status;
    if (!runs || !runs.length) {
      return { task, start: null, end: null }
    }
    return {
      task,
      start: new Date(runs[0].started).valueOf(),
      end: new Date(runs[0].resolved).valueOf(),
    }
  });

  const startTime = Math.min(...sortedTasks.map(t => t.start ?? Infinity));
  const endTime = Math.max(...sortedTasks.map(t=>t.end ?? -Infinity));

  sortedTasks.sort((ta, tb) => {
    if (!ta.start) {
      return -1
    }
    if (!tb.start) {
      return 1
    }
    return ta.start - tb.start
  });

  const profileName = `Task Group ${taskGroup.taskGroupId} - ${new Date(startTime).toLocaleDateString()}`

  profile.meta.interval = 1;
  profile.meta.startTime = startTime;
  profile.meta.product = profileName;
  profile.meta.physicalCPUs = sortedTasks.length;
  profile.meta.CPUName = "Taskcluster"
  profile.meta.markerSchema.push({
    name: "Task",
    tooltipLabel:"{marker.data.name}",
    tableLabel:"{marker.data.name}",
    chartLabel:"{marker.data.name}",
    display: ["marker-chart", "marker-table"],
    data: [
      {
        key: "startTime",
        label: "Start time",
        format: "string"
      },
      {
        key: "name",
        label: "Task Name",
        format: "string",
        searchable: true,
      },
      {
        key: "owner",
        label: "Owner",
        format: "string"
      },
      {
        key: "description",
        label: "Description",
        format: "url"
      },
      {
        key: "url",
        label: "Task URL",
        format: "url",
      },
      {
        key: "source",
        label: "Source URL",
        format: "url"
      },
      {
        key: "taskGroup",
        label: "Task Group URL",
        format: "url",
      },
    ]
  });

  const [thread] = profile.threads;
  thread.isMainThread = true
  thread.name = "Taskcluster"
  delete thread.pid
  const markers = thread.markers;
  thread.stringArray = ["Task"];
  const taskStringIndex = 0;

  for (const {start, end, task} of sortedTasks) {
    if (start === null || end === null) {
      continue
    }
    markers.category.push(0);
    markers.startTime.push(start - startTime);
    markers.endTime.push(end - startTime);
    const durationMarker = 1
    const instantMarker = 2
    markers.phase.push(durationMarker);
    markers.name.push(taskStringIndex);

    markers.data.push({
      type: "Task",
      startTime: new Date(profile.meta.startTime + startTime).toLocaleTimeString(),
      name: task.task.metadata.name,
      url: `https://${url.host}/tasks/${task.task.taskGroupId}`,
      owner: task.task.metadata.owner,
      description: task.task.metadata.description,
      source: task.task.metadata.source,
      taskGroup: url.href
    });
    markers.length++;
  }

  log("Generated profile:", profile)
  return profile;
}
