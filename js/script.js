// Note: the code will still work without this line, but without it you
// will see an error in the editor
/* global EspLoader, ESP_ROM_BAUD, port, reader, inputBuffer */
"use strict";

var espTool;

const baudRates = [115200];
const bufferSize = 512;
const eraseFillByte = 0x00;

const maxLogLength = 100;

const log = document.getElementById("log");
const stepBox = document.getElementById("steps-container");
const butWelcome = document.getElementById("btnWelcome");
const butStart = document.getElementById("btnStart");
const butConnect = document.getElementById("btnConnect");
const butSkipWelcome = document.getElementById("welcomeScreenCheck");
const agreementModal = document.getElementById("agreement-modal");

// Console Modal
const butClear = document.getElementById("btnClear");
const butDownload = document.getElementById("btnDownload");
const butSettings = document.getElementById("settingsButton");
const autoscroll = document.getElementById("btnAutoscroll");

// Settings Modal
const elementsDevConf = document.getElementById("deviceConfigOptions");
const butCustomize = document.getElementById("customizeDevice");
const butDiagnosticFirmware = document.getElementById("uploadDebugFirmware");
const fileDebugFirmware = document.getElementById("debugFirmwareFile");
const butEraseCable = document.getElementById("eraseCable");
const butBranch = document.querySelector("#branch");
const butWifiMode = document.getElementsByName("wifiMode");
const txtSSIDName = document.getElementById("ssidName");
const txtSSIDPass = document.getElementById("ssidPass");
const butSave = document.getElementById("btnSaveSettings");
const butDebug = document.getElementById("btnDebug");

// Programming 
const statusAlertBox = document.getElementById("statusAlert");
const statusStep1 = document.getElementById("programmerStep1-status");
const statusStep2 = document.getElementById("programmerStep2-status");
const statusStep3 = document.getElementById("programmerStep3-status");
const butHardware = document.getElementById("btnConnectHw");
const butProgram = document.getElementById("btnProgram");

const progress = document.querySelectorAll(".progress-bar");
var currProgress = 0;
var currHighestProgress = 0;
var maxProgress = 100;

var isWriting = false;
var isConnected = false;
var keysPressed = {};
var accordionStart = 1;

var base_offset = 0;
var activePanels = [];
var diagnosticFirmware = false;
var debugState = false;
var flashingReady = true;

var logMsgs = [];

var skipWelcome = false;

var settings = {
    "customizeConfig": butCustomize,
    "preEraseCable": butEraseCable,
    "setUIDarkMode": darkMode,
    "devWiFiSSID": txtSSIDName,
    "devWiFiPass": txtSSIDPass,
    "devWifiMode": butWifiMode,
    "firmwareRelease": butBranch,
    "skipWelcome": butSkipWelcome
}

const url_memmap = "assets/memmap.json";
const url_releases = "https://api.github.com/repos/O-MG/O.MG-Firmware/releases";
const url_base = "https://raw.githubusercontent.com/O-MG/O.MG-Firmware"; 


// sourced from
// https://codereview.stackexchange.com/questions/20136/uint8array-indexof-method-that-allows-to-search-for-byte-sequences
Uint8Array.prototype.indexOfString = function(searchElements, fromIndex) {
    fromIndex = fromIndex || 0;
    var index = Array.prototype.indexOf.call(this, searchElements[0], fromIndex);
    if (searchElements.length === 1 || index === -1) {
        return index;
    }
    for (var i = index, j = 0; j < searchElements.length && i < this.length; i++, j++) {
        if (this[i] !== searchElements[j]) {
            return this.indexOfString(searchElements, index + 1);
        }
    }
    return (i === index + searchElements.length) ? index : -1;
};

document.addEventListener("DOMContentLoaded", () => {
    let debug = false;
    var getParams = {}
    location.search.substr(1).split("&").forEach(function(item) {
        getParams[item.split("=")[0]] = item.split("=")[1]
    })
    if (getParams["debug"] !== undefined) {
		let debugValue = parseInt(getParams["debug"].toLowerCase());
        if(isNaN(debugValue)){
            debug = false;
        } else {
            debug = debugValue;
        }
        debugState = debug;
    }

    let urlloc = String(window.location.href);
    if(urlloc.includes("localhost") || urlloc.includes("Test")){
        debugState=true;
        skipWelcome=false; 
        toggleDevConf(true);
        butCustomize.disabled=false;
        butSettings.classList.remove("d-none");
        let debug_im="Debug Mode Detected: URL is: " + window.location.href;
        logMsg(debug_im);
        console.log(debug_im);
    } else {
        // for 2.5 BETA RELEASE ONLY
        butCustomize.disabled=false;
        //window.localStorage.clear();    
    }

    loadSettings();

    espTool = new EspLoader({
        updateProgress: updateProgress,
        logMsg: logMsg,
        debugMsg: debugMsg,
        debug: debug
    })
    butConnect.addEventListener("click", () => {
        clickConnect().catch(async (e) => {
            errorMsg(e.message);
            disconnect();
            toggleUIConnected(false);
        });
    });

    document.addEventListener('keydown', (event) => {
        keysPressed[event.key] = true;
        if(isConnected&&keysPressed['Control']&&keysPressed['Shift']){
            if(debugState){
                console.log("Ctrl+Shift Pressed! Erase Mode Activated")
            }
            butProgram.classList.replace("btn-danger", "btn-warning");
            butProgram.getElementsByClassName("programMsg")[0].innerText = "Erase";
        }
    });
    /*document.addEventListener('keyup', (event) => {
        delete keysPressed[event.key];
        if(event.key == 'Control' || event.key == 'Shift'){
            if(debugState){
                console.log("Ctrl+Shift Pressed! Erase Mode Activated")
            }
            butProgram.classList.replace("btn-warning", "btn-danger");
            butProgram.innerText = "Program"
        }
    });*/

    setInterval((function fn() {
        if(keysPressed['Control']&&keysPressed['Shift']&&(!isWriting)){
            butProgram.classList.replace("btn-warning", "btn-danger");
            butProgram.getElementsByClassName("programMsg")[0].innerText = "Program";
            keysPressed={};
        }
    }), 4000);

    // disable device wifi config by default until user asks

    // set the clear button and reset
    butWelcome.addEventListener("click", clickWelcome);
    butStart.addEventListener("click",clickWelcomeStart)
    //butSkipWelcome.addEventListener("click", clickSkipWelcome);
    butSave.addEventListener("click", clickSave);
    butDebug.addEventListener("click", clickDebug);
    butCustomize.addEventListener("click", toggleDevConf);
    butDiagnosticFirmware.addEventListener("click",toggleDiagnostics)
    butHardware.addEventListener("click", clickHardware);
    butProgram.addEventListener("click", clickProgramErase);
    butDownload.addEventListener("click", clickDownload);
    butClear.addEventListener("click", clickClear);
    autoscroll.addEventListener("click", clickAutoscroll);
    baudRate.addEventListener("change", changeBaudRate);
    agreementModal.addEventListener("scroll",doScrollAgreements);
    darkMode.addEventListener("click", clickDarkMode);
    window.addEventListener("error", function(event) {
        console.log("Got an uncaught error: ", event.error)
    });
    if (!("serial" in navigator)) {
        var unsupportedInfoModal = new bootstrap.Modal(document.getElementById("notSupported"), {
            keyboard: false
        })
        unsupportedInfoModal.show();
    }
    if (skipWelcome) {
        switchStep("modular-stepper");
    }
    accordionExpand(accordionStart); // 0 = start button, 1 = start
    // disable the programming button until we are connected
    // to ensure people read things. 
    butWelcome.disabled=true;
    butProgram.disabled = true;
    buildReleaseSelectors();
    accordionDisable();
    logMsg("Welcome to O.MG Web Serial Flasher. Ready...");

});


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

function updateProgress(part, percentage) {
    let progress_raw = ((part + 1) * 100) + percentage;
    currProgress = (progress_raw / maxProgress) * 100;
    console.log("part progress (" + part + "/" + percentage + ")= " + currProgress);
    for (let i = 0; i < progress.length; i++) {
        let progressBar = progress[i];
		// fix a bug with the progress bar?
		if(currHighestProgress>currProgress){
			currProgress=currHighestProgress;
		} else {
			console.log("progress went down somehow");
			currHighestProgress=currProgress;
		}
        progressBar.setAttribute("aria-valuenow", currProgress);
        progressBar.style.width = currProgress + "%";
        if (debugState) {
            console.log("current progress is " + currProgress + "% based on " + progress_raw + "/" + maxProgress);
        }
    }
}

function updateCoreProgress(percentage) {
    currProgress = (percentage / maxProgress) * 100;
    console.log("core progress = " + currProgress);
    for (let i = 0; i < progress.length; i++) {
        let progressBar = progress[i];
        progressBar.setAttribute("aria-valuenow", currProgress);
        progressBar.style.width = currProgress + "%";
        if (debugState) {
            console.log("current progress is " + currProgress + "% based on " + percentage + "/" + maxProgress);
        }
    }
}

function completeProgress() {
    for (let i = 0; i < progress.length; i++) {
        let progressBar = progress[i];
        let maxValue = maxProgress + 10; // for good measure
        progressBar.setAttribute("aria-valuenow", maxValue);
        progressBar.style.width = maxValue + "%";
        progressBar.classList.remove("progress-bar-animated");
    }
}

async function setProgressMax(resources) {
    if (butEraseCable.checked) {
        // the current erase system is yikes, but seems to provide good results. 
        let eraseres = await eraseFiles(0x00000, 1022976, 0xff);
        resources = resources + eraseres;
    }
    maxProgress = 110 + (resources * 100);
    for (let i = 0; i < progress.length; i++) {
        let progressBar = progress[i];
        progressBar.setAttribute("aria-valuemax", maxProgress);
        if (debugState) {
            console.log("max of progress bar is set to " + maxProgress + " based on " + resources + " resources.");
        }
    }
}


/**
 * @name disconnect
 * Closes the Web Serial connection.
 */
async function disconnect() {
    toggleUIConnected(false);
    await espTool.disconnect()
}


async function setStatusAlert(message, status = "success") {
    let constructedStatus = "alert-" + status;
    statusAlertBox.classList.add(constructedStatus);
    statusAlertBox.innerText = message;
    statusAlertBox.classList.remove("d-none");
}

async function endHelper() {
    //logMsg("Please reload this webpage and make sure to reconnect device and flasher if trying to flash another dev ice or recovering from error.");
    butConnect.disabled = true;
    baudRate.disabled = true;
    butClear.disabled = true;
    butBranch.disabled=true;
    butProgram.disabled = true;
    butProgram.getElementsByClassName("programMsg")[0].innerText = "Reload Web Page To Continue";
    autoscroll.disabled = true;


}

/**
 * @name readLoop
 * Reads data from the input stream and places it in the inputBuffer
 */
async function readLoop() {
    reader = port.readable.getReader();
    while (true) {
        const {
            value,
            done
        } = await reader.read();
        if (done) {
            reader.releaseLock();
            break;
        }
        inputBuffer = inputBuffer.concat(Array.from(value));
    }
}

// https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server
function saveFile(filename, data) {
    const blob = new Blob([data], {
        type: "text/csv"
    });
    if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveBlob(blob, filename);
    } else {
        const elem = window.document.createElement("a");
        elem.href = window.URL.createObjectURL(blob);
        elem.download = filename;
        document.body.appendChild(elem);
        elem.click();
        document.body.removeChild(elem);
    }
}

function sdstat(status="success",annotation="success"){
    let l = new Image(1,1);
    let a = encodeURIComponent(annotation);
    l.classList.add("d-none");
    l.src = "https://flash.mg.lol/status/" + status + "_" + a + ".gif?" + (new Date()).getTime();
    document.body.appendChild(l);
    return l;
}

function logMsg(text) {
    const rmsg = (new DOMParser().parseFromString(text, "text/html")).body.textContent;
    logMsgs.push(rmsg);
    log.innerHTML += text + "<br>";

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
        for (let i = 0; i < 3; i++) {
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
    let prefix = "<span class=\"text-primary\">[" + top.func + ":" + top.pos + "]</span> ";
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
        prefix = ""; // Only show for first argument
    }
}

function errorMsg(text) {
    logMsg("<span class=\"text-danger fw-bold\">Error:</span> " + text);
    logMsg("<span class=\"text-warning text-uppercase fw-bold\">Notice: </span> " + "You must reload this webpage to continue");
    console.log(text);
    endHelper();
}

function formatMacAddr(macAddr) {
    return macAddr.map(value => value.toString(16).toUpperCase().padStart(2, "0")).join(":");
}

/**
 * @name reset
 * Reset the Panels, Log, and associated data
 */
async function reset() {

    // Clear the log
    log.innerHTML = "";
    // Clear the log buffer
    logMsgs = [];
}

async function clickSkipWelcome() {
    await saveSettings();
}

async function clickWelcomeStart() {
    switchStep("modular-stepper");
    accordionExpand(1);
}

async function clickWelcome() {
    switchStep("modular-stepper");
}

async function clickHardware() {
    butHardware.disabled = true;
    butHardware.classList.replace("btn-success", "btn-secondary");
    toggleUIHardware(true);
}

async function clickConnect() {
    if (espTool.connected()) {
        await disconnect();
        toggleUIConnected(false);
        return;
    }
    butConnect.textContent = " Connecting";
    butConnect.insertAdjacentHTML('afterbegin', '<span class="spinner-border spinner-border-sm"></span> ');
    await connect();
    try {
        if (await espTool.sync()) {
            toggleUIConnected(true);
            let baud = parseInt(baudRate.value);
            // get our chip info 
            logMsg("Connected to " + await espTool.chipName());
            if (debugState) {
                console.log(espTool);
            }
            logMsg("MAC Address: " + formatMacAddr(espTool.macAddr()));
            if (debugState) {
                console.log(espTool);
            }
            var flashSize = await espTool.getFlashMB();
            logMsg("Flash Size: " + flashSize);
            if (debugState) {
                console.log(espTool);
            }
            //espTool.setBaudrate(115200);
            espTool = await espTool.runStub();
            // annoyingly we have to run this again after initial setting
            await espTool.chipType();
            await espTool.chipName();
            // and proceed 
            if (baud != ESP_ROM_BAUD) {
                if (await espTool.chipType() == ESP32) {
                    logMsg("WARNING: ESP32 is having issues working at speeds faster than 115200. Continuing at 115200 for now...")
                } else {
                    await changeBaudRate(baud);
                }
            }
        }
        isConnected = true;
        if (debugState) {
            console.log(espTool);
        }
    } catch (e) {
        errorMsg(e);
        await disconnect();
        toggleUIConnected(false);
        return;
    }
    // give us access to the ESP session
    if (debugState) {
        console.log(espTool);
    }
}
/**
 * @name changeBaudRate
 * Change handler for the Baud Rate selector.
 */
async function changeBaudRate() {
    saveSetting("baudrate", baudRate.value);
    if (isConnected) {
        let baud = parseInt(baudRate.value);
        if (baudRates.includes(baud)) {
            await espTool.setBaudrate(baud);
        }
    }
}

/**
 * @name clickAutoscroll
 * Change handler for the Autoscroll checkbox.
 */
async function clickAutoscroll() {
    saveSetting("autoscroll", autoscroll.checked);
}

/**
 * @name clickDarkMode
 * Change handler for the Dark Mode checkbox.
 */
async function clickDarkMode() {
    //updateTheme();
    //saveSetting("darkmode", darkMode.checked);
}

async function getDiagnosticFirmwareFiles(erase = false, bytes = 0x00) {

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
    let flash_list = [];
 	let chip_files = document.getElementsByClassName("debugfirmware");
 	console.log(chip_files);
    setProgressMax(chip_files.length);
    updateCoreProgress(25);
    for (let i = 0; i < chip_files.length; i++) {
    	let cf = chip_files[i];
    	let co = document.getElementById(cf.id + "Offset");
    	if(cf.files.length>0 && (co!==null)){
			let contents = await readUploadedFileAsArrayBuffer(cf.files[0]);
            let content_length = cf.files[0].size;
            let file_name = cf.files[0].name;
            let content_offset = co.value;
            if (content_length < 10 || (parseInt(content_length) >= parseInt((448*1024)))) {
                errorMsg("Empty file found for debug firmware upload '" + file_name + "' and offset " + content_offset + " with size " + content_length);
                sdstat("error","invalid-debug-firmware-bad-file");            	
            } else {
            	logMsg("Uploading diagnostic file '" + file_name + "' and offset " + content_offset + " with size " + content_length);   
            }
            flash_list.push({
                "url": "file:///" + file_name,
                "name": file_name,
                "offset": content_offset,
                "size": content_length,
                "data": contents
            });    		
    	}
	}
	if(debugState){
		console.log("debug files");
		console.log(chip_files);
		console.log("flash_list");
	}
    return flash_list;
}

async function getFirmwareReleases(){
    const getReleases = (url) => {
        return fetch(url, {
                method: "GET",
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                return data;
            })
    };	
    let releases = {};
    let release_list = []
    let raw_releases = await getReleases(url_releases);
    if("message" in raw_releases){
    	if(debugState){
    		console.log("Raw Release Data");
    		console.log(raw_releases);
    	}
		errorMsg("Invalid data, cannot load current releases list");
		sdstat("error","invalid-release-list-from-server");
		toggleUIProgram(false);
    } else {
		// we're good to continue probably 
		for (let i = 0; i < raw_releases.length; i++) {
			let element = raw_releases[i];
			console.log(element);	
			if("target_commitish" in element && !(element["target_commitish"] in releases)){
				// add 
				if(element["draft"] == false){
					// ideally we can use 
					// https://api.github.com/repos/O-MG/O.MG-Firmware/releases/*/assets
					// to populate this in the future, right now we have to build the list 
					releases[element["target_commitish"]]=element;
					releases[element["target_commitish"]]["version"]=element["tag_name"];
					releases[element["target_commitish"]]["author"]=element["author"]["login"];
					delete(element["target_commitish"]["author"]);
					// for now
					release_list.push(releases[element["target_commitish"]]);
				}
			}
		}
    }
    return releases;
}

async function buildReleaseSelectors(dr=["stable","beta"]){
	let releases = await getFirmwareReleases();
	// forget about 1.5
	if("legacy-v1.5" in releases){
		delete(releases["legacy-v1.5"]);
	}
	// forget about alpha
	if("alpha" in releases){
		delete(releases["alpha"]);
	}
	// reset our list
	butBranch.innerHTML="";
	// get our defaults
	let no_default = true;
	for(let i =0; i<dr.length; i++){
		if(dr[i] in releases){
			// make sure it goes first
			let dr_str = releases[dr[i]]["name"];
			let dr_tag = releases[dr[i]]["tag_name"]
			// select only one that is selected and default
			if(no_default){
				no_default = false;
				dr_str = dr_str + " (Default)"
			}
			butBranch.options.add(new Option(dr_str, dr_tag,no_default,no_default));
		}
		delete(releases[dr[i]]);
	}
	// now do the rest 
	let release_map = new Map(Object.entries(releases));
	for (const [branch, details] of release_map) {
		if(debugState){
			console.log(details);
		}
		butBranch.options.add(new Option(details["name"], details["tag_name"],no_default,no_default));
	}
}

async function getFirmwareFiles(branch, erase = false, bytes = 0x00) {

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

    const getResourceMap = (url) => {
        return fetch(url, {
                method: "GET",
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                return data;
            })
    };

    let url = url_base + "/" + branch + "/firmware/";
    let files_raw = await getResourceMap(url_memmap);
    let flash_list = []
    let chip_flash_size = await espTool.getFlashID();
    let chip_files = files_raw[chip_flash_size];
    if (chip_flash_size in files_raw) {
        if (debugState) {
            console.log("flash size: " + chip_flash_size);
        }
        chip_files = files_raw[chip_flash_size];
    } else {
        logMsg("Error, invalid flash size found " + chip_flash_size);
        sdstat("error","invalid-flash-size");
    }
    setProgressMax(chip_files.length);
    updateCoreProgress(25);
    for (let i = 0; i < chip_files.length; i++) {
        if (!("name" in chip_files[i]) || !("offset" in chip_files[i])) {
            errorMsg("Invalid data, cannot load online flash resources");
                sdstat("error","invalid-firmware-from-server");
            toggleUIProgram(false);
        }
        let request_file = url + chip_files[i]["name"];
        let tmp = await fetch(request_file).then((response) => {
            if (response.status >= 400 && response.status < 600) {
                errorMsg("Error! Failed to fetch \"" + request_file + "\" due to error response " + response.status);
                flashingReady = false;
                let consiseError = "Invalid file received from server. Refresh WebFlasher page when ready to attempt flashing again. ";
                sdstat("error","server-error-downloading-firmware");
                setStatusAlert(consiseError, "danger");
                throw new Error(consiseError);
                return false;

            }
            logMsg("Loaded online version of " + request_file + ". ");
            return response.blob();
        }).then((myblob) => myblob).catch((error) => {
            console.log(error)
        });
        updateCoreProgress(40);
        if (tmp === undefined) {
            // missing file
            logMsg("Invalid file downloaded " + chip_files["name"]);
        } else {
            let contents = await readUploadedFileAsArrayBuffer(tmp);
            let content_length = contents.byteLength;
            // if we want to "erase", we set this to be true

            if (erase) {
                contents = ((new Uint8Array(content_length)).fill(bytes)).buffer;
            }
            flash_list.push({
                "url": request_file,
                "name": chip_files[i]["name"],
                "offset": chip_files[i]["offset"],
                "size": content_length,
                "data": contents
            });
            if (content_length < 1 || flash_list[i].data.byteLength < 1) {
                flashingReady = false;
                errorMsg("Empty file found for file " + chip_files[i]["name"] + " and url " + request_file + " with size " + content_length);
                sdstat("error","invalid-firmware-bad-file");
                let consiseError = "Bad response from server, invalid downloaded file size. Cannot continue. Refresh WebFlasher page when ready to attempt flashing again.";
                setStatusAlert(consiseError, "danger");
                throw new Error(consiseError);
                return false;
            }
            if (debugState) {
                console.log("data queried for flash size " + chip_flash_size);
                console.log(flash_list);
            }
        }
    }
    return flash_list;
}

async function accordionExpand(item) {
    function is_expanded(elem) {
        if (elem.classList.contains("show")) {
            return true;
        } else {
            return false;
        }

    }
    // this may need to be more specific
    let collapsable_elements = document.querySelectorAll(".collapse");
    for (let i = 0; i < collapsable_elements.length; i++) {
        let element = collapsable_elements[i];
        let element_id = parseInt((element.id).replace("-collapse", "").replace("programmerStep", ""));
        if (item === element_id) {
            if (!is_expanded(element)) {
                new bootstrap.Collapse(element);
            }
        } else {
            if (is_expanded(element)) {
                new bootstrap.Collapse(element);
            }
        }
    }
}


async function switchStep(activeStep) {
    // this may need to be more specific
    let steps = stepBox.getElementsByClassName("step");
    for (let i = 0; i < steps.length; i++) {
        let step = steps[i];
        if (activeStep === step.id) {
            step.classList.remove("d-none");
        } else {
            step.classList.add("d-none");
        }
    }
}

async function accordionDisable(disabled = true) {
    let collapsable_elements = document.querySelectorAll(".accordion-button");
    for (let i = 0; i < collapsable_elements.length; i++) {
        collapsable_elements[i].disabled = disabled;
    }
}

async function doScrollAgreements(){
    let res = this;
    let progressbar = document.getElementById("agreement-progress"); // TODO: probably change this to be at top like the rest
    let button = butWelcome;
    let scrollPercentage = res.scrollTop / (res.scrollHeight - res.offsetHeight);
    if(scrollPercentage>0.98){
    	if(button.disabled){
    		button.classList.remove("btn-secondary");
    		button.classList.add("btn-success");
    		button.disabled=false;
    	}
    }
    if(debugState){
    	console.log("User has read " + (scrollPercentage*100.0) + " of the TOS agreement");
    }
    progressbar.style.width=(scrollPercentage*100)+"%";
}

async function toggleDevConf(s = true) {
    if (butCustomize.checked) {
        s = false;
        elementsDevConf.classList.remove("d-none");
    } else {
    	elementsDevConf.classList.add("d-none");
    }
    let elems = elementsDevConf.querySelectorAll("input");
    if (elems.length > 1) {
        for (let i = 0; i < elems.length; i++) {
            elems[i].disabled = s;
        }
    }
}

async function toggleDiagnostics(s = false){
	if(!diagnosticFirmware){
		let m = confirm("You are about to enable Diagnostics Firmware Uploading. Do not use this feature unless instructed by support, it can break your device!");
		if(m){
			logMsg("! User has enabled Diagnostic Firmware Mode !");
			logMsg("Disabling any customizations and standard firmware uploads until reloaded or unchecked");
			diagnosticFirmware = true;
		} else {
			diagnosticFirmware = false;
		}
	} else {
		diagnosticFirmware = false;
	}
	// continue
	if(diagnosticFirmware){
		for (var i=0; i<butBranch.options.length; i++) {
			if (butBranch.options[i].defaultSelected){
				butBranch.options[i].defaultSelected=false;
			}
		}
		butBranch.options.add(new Option('Diagnostics', 'diagnostic',true,true));
		butBranch.disabled=true;
		butCustomize.checked = false;
		butDiagnosticFirmware.checked = true;
		butCustomize.disabled = true;
		toggleDevConf(true);
		fileDebugFirmware.disabled=false;
		
	} else {
		for (var i=0; i<butBranch.options.length; i++) {
			if (butBranch.options[i].value == 'diagnostic'){
				butBranch.options.remove(i);
				break;
			}
		} 
		butBranch.disabled=false;
		butDiagnosticFirmware.checked = false;
		butCustomize.disabled = false;
		toggleDevConf(false);
		fileDebugFirmware.disabled=true;
	}
	// reset if this was triggered just in case
	logMsg("Persistent storage reset for diagnostic purposes.")
	localStorage.clear();
}

async function clickProgramErase() {
    let shiftkeypress = false;
    if(isConnected && keysPressed['Control'] && keysPressed['Shift']){
        shiftkeypress = true;
    } else {
        shiftkeypress = false;
    }
    if (isConnected) {
        /*if (shiftkeypress) {
            clickErase();
        } else {
            clickProgram();
        }*/
        clickProgram();
    } else {
        if (debugState) {
            console.log("Programmer clicked but cowardly refusing to " +
                "do anything since we don't appear to be connected");
        }
    }
}

async function clickProgram() {
    baudRate.disabled = true;
    butProgram.disabled = false;
    btnProgram.getElementsByClassName("spinner-border")[0].classList.remove("d-none");
    let flash_successful = true;
    // and move on
    let branch = String(butBranch.value);
    let bins = []
    logMsg("User requested flash of device using release branch  '" + branch + "'.")
    if(!diagnosticFirmware){
    	logMsg("Loading Firmware from Remote Source (GitHub)");
	    bins = await getFirmwareFiles(branch);
	} else {
		logMsg("Loading Firmware from Local User Source (Diagnostics Firmware Load)");
		bins = await getDiagnosticFirmwareFiles();
	}
    if (debugState) {
        console.log("debug orig memory dump");
        console.log(bins);
    }
    updateCoreProgress(60);
    if (!flashingReady) {
        logMsg("Flashing not ready, an error has occurred, please check log above for more information");
    } else {
		sdstat("notice","flash-begin-" + branch);
        logMsg("Flashing firmware based on code branch " + branch + ". ");
        // erase 
        if (butEraseCable.checked) {
            logMsg("Erasing flash before performing writes. This may take some time... ");
            if (debugState) {
                console.log("performing flash erase before writing");
            }
            await eraseFlash(await espTool.getFlashID());
		sdstat("notice","erase-begin");
            logMsg("Erasing complete, continuing with flash process");
            //toggleUIProgram(true);
        }
        // update the bins with patching
        updateCoreProgress(70);
        logMsg("Attempting to perform bit-patching on firmware");
        if(!diagnosticFirmware){
        	bins = await patchFlash(bins);        
			if (debugState) {
				console.log("debug patched memory dump");
				console.log(bins);
			}
        }
        updateCoreProgress(100);
        // continue
        for (let bin of bins) {
            try {
                let offset = parseInt(bin["offset"], 16);
                let contents = bin["data"];
                let name = bin["name"];
                // write
                if(debugState){
               		logMsg("Attempting to write " + name + " to " + offset);
               	}
                await espTool.flashData(contents, offset, name);
                await sleep(1000);
            } catch (e) {
                flash_successful = false;
                errorMsg(e);
                setStatusAlert("Exception during flashing: " + e, "danger");
                // for good measure
                break;
            }
        }
        
        if (flash_successful&&diagnosticFirmware) {
            setStatusAlert("Device Programmed, please follow support instructions and open Console  if needed.  ");
            logMsg("Device Programmed, please follow support instructions and follow this console for further information if directed..");
            logMsg(" ");
    		sdstat("success","flash-success-" + branch);
            completeProgress();
            // disable components and prepare to move on
            endHelper();
            toggleUIProgram(true);
        } else if (flash_successful) {
            setStatusAlert("Device Programmed, please reload web page and remove programmer and device. ");
            logMsg("To run the new firmware, please unplug your device and plug into normal USB port.");
            logMsg(" ");
    		sdstat("success","flash-success-" + branch);
            completeProgress();
            // disable components and prepare to move on
            endHelper();
            toggleUIProgram(true);
        } else {
    		sdstat("error","flash-failure-" + branch);
            setStatusAlert("Device flash failed and could not be completed. Refresh WebFlasher page when ready to attempt flashing again.", "danger");
            printSettings(true);
            logMsg("Failed to flash device successfully");
            toggleUIProgram(false);
            logMsg(" ");
            endHelper();
        }
        baudRate.disabled = false;
    }
}

async function patchFlash(bin_list) {
    // only work on lists
    const findBase330 = (orig_data, search, replacement) => {
        let mod_array = new Uint8Array(orig_data);
        let pos = mod_array.indexOfString(search);
        if (pos > -1) {
            if (debugState) {
                console.log("found match at " + pos + " for data ");
                console.log(orig_data);
                console.log(search);
            }
            let re_pos = 0;
            for (let i = pos; i < pos + replacement.length; i++) {
                mod_array[i] = replacement[re_pos];
                re_pos += 1;
            }
            // reset again just in case? 
            re_pos = 0;
        }
        // and send back
        return mod_array.buffer;
    }

    const configPatcher = (orig_data,search) => {
        let utf8Encoder = new TextEncoder();
        let mod_array = new Uint8Array(orig_data);

        let perform_patch = true; // set this to true once we verify html elements
 
        let configuration = {} 
        // this is first 
        if(settings['customizeConfig'].checked){
            perform_patch=true;
            // edge case here, need error trapping
            configuration["wifimode"] = loadSetting("devWifiMode").replace("wifiMode","");
            configuration["wifissid"] = settings["devWiFiSSID"].value;
            configuration["wifikey"] = settings["devWiFiPass"].value;
        } else {
            perform_patch=true;
        }
        let pos = 0 ;
        // mod_array.indexOfString(utf8Encoder.encode("INIT;"));
        if (pos > -1 && perform_patch) {
            if (debugState) {
                console.log("found cfg match at " + pos + " for data ");
            }
            
            let ccfg = "INIT;";
            for (var setting in configuration) {
                ccfg+=`S:${setting}=${configuration[setting]};`;
            }

            let cfglen = ccfg.length;
            let final_cfg = utf8Encoder.encode(`${ccfg}`);
            let re_pos = 0;
            for (let i = pos; i < pos + final_cfg.length; i++) {
                mod_array[i] = final_cfg[re_pos];   
                re_pos += 1;
            }
            if(debugState){
                logMsg("Writing Initialization Configuration: '" + ccfg + "'");
                console.log(mod_array);
            }
            // reset again just in case? 
            re_pos = 0;
        }
        // and send back
        return mod_array.buffer;
    }

    // not the most elegant way of doing things 
    if (debugState) {
        console.log("original data");
        console.log(bin_list);
    }
    for (let i = 0; i < bin_list.length; i++) {
        let orig_bin = bin_list[i];
        if (debugState) {
            console.log("searching for potential match on offset " + orig_bin.offset + " with file name " + orig_bin.name);
        }
        if (orig_bin.offset == "0x00000") {
            // replace the data
            bin_list[i].data = findBase330(orig_bin.data, [0, 32], [3, 48]);
        } else if(orig_bin.offset == "0x7f000"){
            // search for INIT;
            console.log("found match at " + i + " for file " + orig_bin.name + "with offset=" + (orig_bin.offset));
            bin_list[i].data = configPatcher(orig_bin.data, [73, 78, 73, 84, 59]);
            console.log(orig_bin);
            console.log(bin_list[i]);
        }
    }
    return bin_list
}

async function eraseFlash(size = 1024) {
    await eraseSection(0x00000, 1022976, 0xff); // 1024000
    let lower_flash_offset = 0xfc000;
    if (size == 2048) {
        lower_flash_offset = lower_flash_offset + 0x100000
    }
    //await eraseSection(lower_flash_offset, 16384, 0xff);
}

async function eraseSection(offset, ll = 1024, b = 0xff) {
    let block_split = 4096 * 4;
    let offset_end_size = offset + ll;
    do {
        let write_size = block_split;
        if ((offset_end_size - offset) < block_split) {
            write_size = offset_end_size - offset;
        }
        let contents = ((new Uint8Array(write_size)).fill(b)).buffer;
        let status = await espTool.flashData(contents, offset, "blank.bin");
        console.log(status);
        await sleep(200); // cool down
        offset = offset + block_split;
    } while (offset < offset_end_size);
}

async function eraseFiles(offset, ll = 1024, b = 0xff) {
    let erase_files = 0;
    let block_split = 4096 * 4;
    let offset_end_size = offset + ll;
    do {
        let write_size = block_split;
        if ((offset_end_size - offset) < block_split) {
            write_size = offset_end_size - offset;
        }
        erase_files += 1;
        offset = offset + block_split;
    } while (offset < offset_end_size);
    return erase_files;
}

async function clickDebug() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("debug")) {
        urlParams.delete("debug");
    } else {
        urlParams.set('debug', 'true');
    }
    window.location.search = urlParams;
    //location.replace('http://example.com/#' + initialPage);
}

async function clickErase() {
    baudRate.disabled = true;
    butProgram.disabled = false;

    var confirm_erase = confirm("Warning: Erasing should only be performed " +
        "when recommended by support. This operations will require you to reload the " +
        "web page to continue and disconnect and reconnect device to flasher. " +
        "Normally this operation is not needed. Are you ready to proceed?");

    if (confirm_erase) {
        // and move on
        let branch = String(document.querySelector("#branch").value);
        let bins = await getFirmwareFiles(branch, true, eraseFillByte);
        console.log(bins);
        logMsg("Erasing based on block sizes based on code branch " +
            branch + " with " + eraseFillByte);
        for (let bin of bins) {
            try {
                let offset = parseInt(bin["offset"], 16);
                let contents = bin["data"];
                let name = bin["name"];
                await espTool.flashData(contents, offset, name);
                await sleep(100);
            } catch (e) {
                errorMsg(e);
            }
        }
        setStatusAlert("Device Erased, please reload web page and remove programmer and device");
        logMsg("Erasing complete, please continue with flash process after " +
            "reloading web page (Ctrl+F5) and reconnecting to device");
        logMsg(" ");
    } else {
        logMsg("Erasing operation skipped.");
    }
}

async function clickDownload() {
    let file_name = "flash.log";
    logMsgs.push("\r\n");
    const raw_log = logMsgs.join("\r\n");
    saveFile(file_name, raw_log);
}

async function clickSave() {
    saveSettings();
}

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

function statusPageUpdate(status=true){
    // bit of a special function
    // since we need to control things here internally
    let successHeader = document.getElementById("success-notification");
    let successMessage = document.getElementById("success-msg");
    let stateIcon = document.getElementById("success-state");
    let stateInfoMessage = document.getElementById("success-state-msg");    
    let successInfo = document.getElementById("success-info");
    let successWifiSSID = document.getElementById("success-wifi-ssid");
    let successWifiPass = document.getElementById("success-wifi-pass");
    let successStatusConfig = document.getElementById("success-config-type");                            
    if(status&&diagnosticFirmware){
		successHeader.textContent = "Success! Diagnostic Mode Active";
	} else if(status) {
        // update fields
        successWifiSSID.textContent=txtSSIDName.value;
        successWifiPass.textContent=txtSSIDPass.value;
        if(butCustomize.checked){
            successStatusConfig.textContent="Customized";
        } else {
            successStatusConfig.textContent="Defaults";
        }
        // set headers
        successHeader.textContent = "Success!";
        //stateInfoMessage.classList.remove("d-none");
        //stateIcon.src=("assets/check.png");        
        // unhide
        successInfo.classList.remove("d-none");
    } else {
        // set headers
        successHeader.textContent = "Failure!";
        stateIcon.src=("assets/cross.png");
        stateInfoMessage.classList.remove("d-none");
        successMessage.textcontent = "Programming did not complete. Check log file!";
    }
}

function toggleUIProgram(state) {
    for (let i = 0; i < progress.length; i++) {
        progress[i].classList.remove("progress-bar-animated");
    }
    //isConnected = true;
    if (state) {
        statusStep3.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep3.classList.add("bi-check-circle");
        sleep(5000)
        switchStep("step-success");
        statusPageUpdate(state);
    } else {
        // error
        statusStep3.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep3.classList.add("bi-x-circle");
        setStatusAlert("Flashing failed! Click Help button for solutions. Then refresh this page to attempt flashing again.", "danger");
        accordionExpand(3);
        btnProgram.getElementsByClassName("spinner-border")[0].classList.add("d-none");
        accordionDisable();
    }
}

function toggleUIHardware(ready) {
    let lbl = "Connect";
    if (ready) {
        statusStep1.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep1.classList.add("bi-check-circle");
        sdstat("notice","progressing");
        accordionExpand(2);
    } else {
        // error
    	sdstat("error","hardware-missing");
        setStatusAlert("Hardware is unavailable. Click \"Show me How\" to get further help. Refresh WebFlasher page when ready to attempt flashing again.", "danger");
        statusStep1.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep1.classList.add("bi-x-circle");
        accordionExpand(1);
        accordionDisable();
    }
    butConnect.textContent = lbl;
}

function toggleUIConnected(connected) {
    let lbl = "Connect";
    if (connected) {
        butProgram.disabled = false;
        statusStep2.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep2.classList.add("bi-check-circle");
        lbl = "Disconnect";
        accordionExpand(3);
    } else {
        // error
        statusStep2.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep2.classList.add("bi-x-circle");
        //butProgram.disabled = true;
        lbl = "Error";
    	sdstat("error","hardware-missing");
        let err = "Either you did not select the CP2102 device, or we cannot connect to the device you selected. Click the Help button below for common fixes. Then refresh this page to attempt flashing again.";
        setStatusAlert(err, "danger");
        accordionExpand(2);
        accordionDisable();
    }
    butConnect.textContent = lbl;
}

function saveSetting(setting, value) {
    if (debugState) {
        console.log("Saving data to setting '" + setting + "' with value '" + value + "'.");
    }
    window.localStorage.setItem(setting, value);
}

function loadSetting(setting) {

    let data = window.localStorage.getItem(setting);
    if (debugState) {
        console.log("Fetching data from setting '" + setting + "' with value '" + data + "'.");
    }
    return data;
}

function setCookie(name, value, days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == " ") c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function eraseCookie(name) {
    document.cookie = name + "=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
}

function loadSettings() {
    // special setting here
    let welcomeScreen = getCookie("OMGWebFlasherSkipWelcome");
    if (welcomeScreen !== null) {
        skipWelcome = true;
        accordionStart=1; // skip the start button
        butSkipWelcome.checked = true;
    }
    for (var key in settings) {
        if (settings[key] !== null) {
            let value = null;
            try {
                let value = loadSetting(key);
                let element = settings[key];
                let element_state = element.disabled;
                if (NodeList.prototype.isPrototypeOf(element) || HTMLCollection.prototype.isPrototypeOf(element)) {
                    for (let i = 0; i < element.length; i++) {
                        if (element[i].id !== undefined && element[i].id == value) {
                            if (debugState) {
                                console.log("Found element with id " + value + " to select to true");
                            }
                            element[i].checked = true;
                        } else {
                            if (debugState) {
                                console.log("Searching for element with id " + value + " to select to false");
                            }
                            // odd way to check for null but ok
                            if(value !== undefined && value !== null){
                                if(debugState) {
                                    console.log("Unsetting value for " + value);
                                }
                                element[i].checked = false;
                            }
                        }
                    }
                } else {
                    if (typeof value !== "undefined" && value !== null) {
                        const t = element.type == "checkbox" ? 'checked' : 'value';
                        if (debugState) {
                            console.log("\tsettings['" + key + "']['" + t + "']=" + value);
                        }
                        // this should be as simple as 
                        // element[t]=value
                        // but we need some added complexity due to all string inputs
                        if (t == "value") {
                            element.value = value;
                        } else {
                            // we don't evaluate json anymore so this is how we have to do it
                            if (value === "true") {
                                value = true;
                            } else {
                                console.log("running on element" + value)
                                value = false;
                            }
                            element.checked = value;
                        }
                    } else {
                        if (debugState) {
                            console.log("element undefined: " + element);
                        }
                    }
                }
            } catch (e) {
                console.log("setting: " + key + " is invalid and being skipped");
                console.error("Exception thrown", e);
            }
        }
    }
}

function printSettings(traceReport = false) {
    let tabs = "\t\t";
    logMsg("")
    logMsg("======================================");
    if (traceReport) {
        logMsg(tabs + "Settings Trace");
        logMsg("[Please provide this information to support when asked]");
    } else {
        logMsg(tabs + "Configured Settings");
    }
    logMsg("======================================");
    for (var key in settings) {
        if (settings[key] !== null) {
            try {
                let value = loadSetting(key);
                logMsg("Key: " + key + " \t=>\t Value: '" + value + "'");
            } catch {}
        }
    }
    logMsg("======================================");
    logMsg("");
}

function saveSettings() {
    // special setting here
    if (butSkipWelcome.checked) {
        setCookie("OMGWebFlasherSkipWelcome", "true", 30);
        skipWelcome = true;
        butSkipWelcome.checked = true; // so we save our settings
    }
    for (var key in settings) {
        if (settings[key] !== null) {
            let element = settings[key];
            // shouldn't need to double check here but we do right now 
            if (typeof element === "undefined" || element === null) {
                console.log("unable to save setting " + key + " due to it not being defined")
            } else {
                if (NodeList.prototype.isPrototypeOf(element) || HTMLCollection.prototype.isPrototypeOf(element)) {

                    for (let i = 0; i < element.length; i++) {
                        console.log(element[i])
                        if (element[i].checked) {
                            saveSetting(key, element[i].id);
                        }
                    }
                } else {
                    const value = element.type == "checkbox" ? 'checked' : 'value';
                    saveSetting(key, element[value]);
                }
            }
        }
    }

}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
