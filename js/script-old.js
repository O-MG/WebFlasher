// Note: the code will still work without this line, but without it you
// will see an error in the editor
/* global EspLoader, ESP_ROM_BAUD, port, reader, inputBuffer */
'use strict';

let espTool;
let isConnected = false;

const baudRates = [921600, 115200, 230400, 460800];
const addresses = [
  	"0xfc000",
  	"0x00000",
  	"0x10000",
  	"0x80000",
  	"0x7f000"
  ]
const files =  [
	"esp_init_data_default_v08.bin",
	"image.elf-0x00000.bin",
	"image.elf-0x10000.bin",
	"page.mpfs",
	"blank.bin"
  ]
  
const bufferSize = 512;
const colors = ['#00a7e9', '#f89521', '#be1e2d'];
const measurementPeriodId = '0001';

const maxLogLength = 100;
const log = document.getElementById('log');
const butConnect = document.getElementById('butConnect');
const baudRate = document.getElementById('baudRate');
const butClear = document.getElementById('butClear');
const butProgram = document.getElementById('butProgram');
const autoscroll = document.getElementById('autoscroll');
const debugConsole = document.getElementById('debugConsole');
const lightSS = document.getElementById('light');
const darkSS = document.getElementById('dark');
const darkMode = document.getElementById('darkmode');
const progress = document.querySelectorAll(".progress-bar");
const appDiv = document.getElementById('app');

let blobs = [];
let offsets = [];
let firmware = [];


let base_offset = 0;
let colorIndex = 0;
let activePanels = [];
let bytesReceived = 0;
let currentBoard;
let buttonState = 0;
let readyToFlash = 0;

document.addEventListener('DOMContentLoaded', () => {
  let debug = false;
  var getParams = {}
  location.search.substr(1).split("&").forEach(function(item) {getParams[item.split("=")[0]] = item.split("=")[1]})
  if (getParams["debug"] !== undefined) {
    debug = getParams["debug"] == "1" || getParams["debug"].toLowerCase() == "true";
  }

  espTool = new EspLoader({
    updateProgress: updateProgress,
    logMsg: logMsg,
    debugMsg: debugMsg,
    debug: debug})
  butConnect.addEventListener('click', () => {
    clickConnect().catch(async (e) => {
      errorMsg(e.message);
      disconnect();
      toggleUIConnected(false);
    });
  });
  
  if(String(location.hash).length > 1){
  	// if on load we have a request, let this handle it 
  	checkRelease(); // quirk?
  }
  window.addEventListener('hashchange', function() {
  	checkRelease();
  }, false);

  butClear.addEventListener('click', clickClear);
  butProgram.addEventListener('click', clickProgram);
  if(readyToFlash == 1){
  	checkFirmware();
  	checkProgrammable();
  }
  debugConsole.addEventListener('click', clickDebugConsole);
  autoscroll.addEventListener('click', clickAutoscroll);
  baudRate.addEventListener('change', changeBaudRate);
  darkMode.addEventListener('click', clickDarkMode);
  window.addEventListener('error', function(event) {
    console.log("Got an uncaught error: ", event.error)
  });
  if ('serial' in navigator) {
    const notSupported = document.getElementById('notSupported');
    notSupported.classList.add('hidden');
  }

  initBaudRate();
  loadAllSettings();
  updateTheme();
  logMsg("WebSerial ESPTool loaded.");
  logMsg("Click on release of firmware you wish to load...");
});

async function checkRelease(){
	let uhash = String(location.hash).toLowerCase().replace("#","").trim();
  	var fhash="";
  	console.log('User requested release ' + uhash);
	switch(uhash) {
	  case "dev":
		// code block
		fhash="dev";
		break;
	  case "custom":
		fhash=String(prompt("At the direction of support, please enter a GitHub branch or tag to specify custom firmware to use. Only do this IF requested! (e.g. uitroubleshooting1)")).toLowerCase().trim();
		if(fhash === ""){
			alert("Invalid branch, aborting");
		}
		break;
	  default:
		fhash="master";
		break;
		// code block
	}
	if(fhash.length>1){
		downloadFirmware(files,fhash);	
	}
}

async function downloadFirmware(files, branch="master") {
  let url_base = "https://raw.githubusercontent.com/O-MG/O.MG_Cable-Firmware/"
  let url = url_base + "/" + branch + "/firmware/"

  // TODO: Need to have base for adjustments 
  for (let i = 0; i < files.length; i++) {
    let request_file = files[i];
    console.log(url + request_file);
	let tmp = await fetch(url + request_file).then((response) => {
		if (response.status >= 400 && response.status < 600) {
			logMsg("Error! Failed to fetch '" + request_file + "' due to error response " + response.status)
	  		throw new Error("Bad response from server");
		}
		logMsg("Loaded online version of " + request_file + ". ")
		return response.blob();
	}).then((myblob)=>myblob).catch((error) => {
		console.log(error)
	});
	blobs.push({
		address: addresses[i],
		//data: myblob,
		name: request_file,
		req: tmp,
		data: ""
	});
  }
}

/**
 * @name connect
 * Opens a Web Serial connection to a micro:bit and sets up the input and
 * output stream.
 */
async function connect() {
  logMsg("Connecting...")
  await espTool.connect()
  readLoop().catch((error) => {
    toggleUIConnected(false);
  });
}

function initBaudRate() {
  for (let rate of baudRates) {
    var option = document.createElement("option");
    option.text = rate + " Baud";
    option.value = rate;
    baudRate.add(option);
  }
}

function updateProgress(segment, percentage) {
  let part = (segment + 1.0) * (1/5) ;
  let progressBar = progress[0].querySelector("div");
  progressBar.style.width = (part * percentage) + "%";
}

/**
 * @name disconnect
 * Closes the Web Serial connection.
 */
async function disconnect() {
  toggleUIToolbar(false);
  await espTool.disconnect()
}

/**
 * @name readLoop
 * Reads data from the input stream and places it in the inputBuffer
 */
async function readLoop() {
  reader = port.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      reader.releaseLock();
      break;
    }
    inputBuffer = inputBuffer.concat(Array.from(value));
  }
}

function logMsg(text) {
  log.innerHTML += text+ "<br>";

  // Remove old log content
  if (log.textContent.split("\n").length > maxLogLength + 1) {
    let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
    log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
  }

  if (autoscroll.checked) {
    log.scrollTop = log.scrollHeight
  }
}

function debugMsg(...args) {
  function getStackTrace() {
    let stack = new Error().stack;
    stack = stack.split("\n").map(v => v.trim());
    for (let i=0; i<3; i++) {
        stack.shift();
    }

    let trace = [];
    for (let line of stack) {
      line = line.replace("at ", "");
      trace.push({
        "func": line.substr(0, line.indexOf("(") - 1),
        "pos": line.substring(line.indexOf(".js:") + 4, line.lastIndexOf(":"))
      });
    }

    return trace;
  }

  let stack = getStackTrace();
  stack.shift();
  let top = stack.shift();
  let prefix = '<span class="debug-function">[' + top.func + ":" + top.pos + ']</span> ';
  for (let arg of args) {
    if (typeof arg == "string") {
      logMsg(prefix + arg);
    } else if (typeof arg == "number") {
      logMsg(prefix + arg);
    } else if (typeof arg == "boolean") {
      logMsg(prefix + arg ? "true" : "false");
    } else if (Array.isArray(arg)) {
      logMsg(prefix + "[" + arg.map(value => espTool.toHex(value)).join(", ") + "]");
    } else if (typeof arg == "object" && (arg instanceof Uint8Array)) {
      logMsg(prefix + "[" + Array.from(arg).map(value => espTool.toHex(value)).join(", ") + "]");
    } else {
      logMsg(prefix + "Unhandled type of argument:" + typeof arg);
      console.log(arg);
    }
    prefix = "";  // Only show for first argument
  }
}

function errorMsg(text) {
  logMsg('<span class="error-message">Error:</span> ' + text);
  console.log(text);
}

function formatMacAddr(macAddr) {
  return macAddr.map(value => value.toString(16).toUpperCase().padStart(2, "0")).join(":");
}

/**
 * @name updateTheme
 * Sets the theme to  Adafruit (dark) mode. Can be refactored later for more themes
 */
function updateTheme() {
  // Disable all themes
  document
    .querySelectorAll('link[rel=stylesheet].alternate')
    .forEach((styleSheet) => {
      enableStyleSheet(styleSheet, false);
    });

  if (darkMode.checked) {
    enableStyleSheet(darkSS, true);
  } else {
    enableStyleSheet(darkSS, false);
  }
}

function toggleDebugConsole(){
  if (debugConsole.checked) {
    log.classList.add('hidden');
    saveSetting('debugConsole', false);
  } else {
    log.classList.remove('hidden');
    saveSetting('debugConsole', autoscroll.checked);
  }
}

function enableStyleSheet(node, enabled) {
  node.disabled = !enabled;
}

/**
 * @name reset
 * Reset the Panels, Log, and associated data
 */
async function reset() {
  bytesReceived = 0;

  // Clear the log
  log.innerHTML = "";
}

/**
 * @name clickConnect
 * Click handler for the connect/disconnect button.
 */
async function clickConnect() {
  if (espTool.connected()) {
    await disconnect();
    toggleUIConnected(false);
    return;
  }

  await connect();

  toggleUIConnected(true);
  try {
    if (await espTool.sync()) {
      toggleUIToolbar(true);
      appDiv.classList.add("connected");
      let baud = parseInt(baudRate.value);
      logMsg("Connected to " + await espTool.chipName());
      logMsg("MAC Address: " + formatMacAddr(espTool.macAddr()));
      var flashWriteSize = espTool.getFlashWriteSize();
      console.log(flashWriteSize);
      console.log("Asdfasdfasfasdfas");
      logMsg("Flash Size: " + (flashWriteSize/1024) + " MB ");
      switch(flashWriteSize){
      	case 1024:
        	base_offset = `0xfc00`;     
        	break;
        case 2048:
        	base_offset = `0x1fc000`;     
        	break;
      }
      espTool = await espTool.runStub();
      if (baud != ESP_ROM_BAUD) {
        if (await espTool.chipType() == ESP32) {
          logMsg("WARNING: ESP32 is having issues working at speeds faster than 115200. Continuing at 115200 for now...")
        } else {
          await changeBaudRate(baud);
        }
      }
    }
  } catch(e) {
    errorMsg(e);
    await disconnect();
    toggleUIConnected(false);
    return;
  }
}

/**
 * @name changeBaudRate
 * Change handler for the Baud Rate selector.
 */
async function changeBaudRate() {
  saveSetting('baudrate', baudRate.value);
  if (isConnected) {
    let baud = parseInt(baudRate.value);
    if (baudRates.includes(baud)) {
      await espTool.setBaudrate(baud);
    }
  }
}


window.addEventListener('hashchange', function() {
  console.log('user has requested ' + location.hash);
  
}, false);


/**
 * @name clickAutoscroll
 * Change handler for the Autoscroll checkbox.
 */
async function clickAutoscroll() {
  saveSetting('autoscroll', autoscroll.checked);
}

async function clickDebugConsole(){
  toggleDebugConsole();
}

/**
 * @name clickDarkMode
 * Change handler for the Dark Mode checkbox.
 */
async function clickDarkMode() {
  updateTheme();
  saveSetting('darkmode', darkMode.checked);
}

/**
 * @name clickProgram
 * Click handler for the program button.
 */
async function clickProgram() {
  let firmware_files = getValidFiles();
  let i = 0;
  for (let file of getValidFiles()) {
    progress[0].classList.remove("hidden");
    contents = file.data;
    offset = file.offset;
    file = file.name;
    try {
      let offset = parseInt(offsets[file].value, 16);
      logMsg("data offset: " + offset)
      await espTool.flashData(contents, offset, file);
      await sleep(100);
      logMsg("To run the new firmware, please reset your device.");
    } catch(e) {
      console.log("error point");
      errorMsg(e);
    }
    i++;
  }
  progress[0].classList.add("hidden");
  progress[0].querySelector("div").style.width = "0";
  baudRate.disabled = false;
  butProgram.disabled = getValidFiles().length == 0;
}

function getValidFiles() {
  const readUploadedFileAsArrayBuffer = (inputFile) => {
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onerror = () => {
        reader.abort();
        reject(new DOMException("Problem parsing input file."));
      };

      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(inputFile);
    });
  };
  // Get a list of file and offsets
  // This will be used to check if we have valid stuff
  // and will also return a list of files to program
  let validBlobs = [];
  for (let i = 0; i < blobs.length; i++) {
  	let offs = parseInt(blobs[i].value, 16);
  	console.log(blobs[i])
  	if(blobs[i].req === undefined){
  		// missing file
  	} else {
		if (blobs[i].req.size > 0 && !offsets.includes(offs)) {
		  firmware.push(blobs[i].name);
		  offsets.push(offs);
		  // actually store our data 
		  let contents = readUploadedFileAsArrayBuffer(blobs[i].req);
		  blobs[i].data = contents;
		  console.log(blobs[i].data);
		  validBlobs.push(blobs[i]);
		}
	}
  }
  if((validBlobs.length === blobs.length) && (blobs.length>=4)){
  	readyToFlash=1;
  }
  return validBlobs;
}

/**
 * @name checkProgrammable
 * Check if the conditions to program the device are sufficient
 */
async function checkProgrammable() {
  butProgram.disabled = getValidFiles().length == 0;
}

/**
 * @name checkFirmware
 * Handler for firmware upload changes
 */
async function checkFirmware(event) {
  await checkProgrammable();
}

/**
 * @name clickClear
 * Click handler for the clear button.
 */
async function clickClear() {
  reset();
}

function convertJSON(chunk) {
  try {
    let jsonObj = JSON.parse(chunk);
    return jsonObj;
  } catch (e) {
    return chunk;
  }
}

function toggleUIToolbar(show) {
  isConnected = show;
  progress[0].classList.add("hidden");
  progress[0].querySelector("div").style.width = "0";
  if (show) {
    appDiv.classList.add("connected");
  } else {
    appDiv.classList.remove("connected");
  }
}

function toggleUIConnected(connected) {
  let lbl = 'Connect';
  if (connected) {
    lbl = 'Disconnect';
  } else {
    toggleUIToolbar(false);
  }
  butConnect.textContent = lbl;
}

function loadAllSettings() {
  // Load all saved settings or defaults
  autoscroll.checked = loadSetting('autoscroll', true);
  debugConsole.checked = loadSetting('debugConsole', true);
  baudRate.value = loadSetting('baudrate', baudRates[0]);
  darkMode.checked = loadSetting('darkmode', true);
}

function loadSetting(setting, defaultValue) {
  let value = JSON.parse(window.localStorage.getItem(setting));
  if (value == null) {
    return defaultValue;
  }

  return value;
}

function saveSetting(setting, value) {
  window.localStorage.setItem(setting, JSON.stringify(value));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
