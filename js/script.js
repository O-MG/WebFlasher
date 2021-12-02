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
const butConnect = document.getElementById("btnConnect");
const butSkipWelcome = document.getElementById("welcomeScreenCheck");


// Console Modal
const butClear = document.getElementById("btnClear");
const butDownload = document.getElementById("btnDownload");
const autoscroll = document.getElementById("btnAutoscroll");

// Settings Modal
const elementsDevConf = document.getElementById("deviceConfigOptions");
const butCustomize = document.getElementById("customizeDevice");
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
var maxProgress = 100;

var isConnected = false;

var base_offset = 0;
var activePanels = [];
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
const url_base = "https://raw.githubusercontent.com/O-MG/O.MG_Cable-Firmware";


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
        debug = getParams["debug"] == "1" || getParams["debug"].toLowerCase() == "true";
        debugState = debug;
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

    // set the clear button and reset
    document.addEventListener("keydown", (event) => {
        if (isConnected && (event.isComposing || event.key == "Shift")) {
            //console.log("Shift Key Pressed");
            butProgram.classList.replace("btn-danger", "btn-warning");
            butProgram.innerText = "Erase";
        }
    });

    document.addEventListener("keyup", (event) => {
        if (isConnected && event.key == "Shift") {
            //console.log("Shift Key Unpressed");
            butProgram.classList.replace("btn-warning", "btn-danger");
            butProgram.innerText = "Program"
        }
    });

    // disable device wifi config by default until user asks
    toggleDevConf(true);
    butWelcome.addEventListener("click", clickWelcome);
    butSkipWelcome.addEventListener("click", clickSkipWelcome);
    butSave.addEventListener("click", clickSave);
    butDebug.addEventListener("click",clickDebug);
    butCustomize.addEventListener("click", toggleDevConf);
    butHardware.addEventListener("click", clickHardware);
    butProgram.addEventListener("click", clickProgramErase);
    butDownload.addEventListener("click", clickDownload);
    butClear.addEventListener("click", clickClear);
    autoscroll.addEventListener("click", clickAutoscroll);
    baudRate.addEventListener("change", changeBaudRate);
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
    accordionExpand(1);
    // disable the programming button until we are connected
    butProgram.disabled = true;
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
    let progressBar = progress[0]; //.querySelector("div");
    progressBar.setAttribute("aria-valuenow", currProgress);
    progressBar.style.width = currProgress + "%";
    if (debugState) {
        console.log("current progress is " + currProgress + "% based on " + progress_raw + "/" + maxProgress);
    }
}

function updateCoreProgress(percentage) {
    currProgress = (percentage / maxProgress) * 100;
    let progressBar = progress[0];
    progressBar.setAttribute("aria-valuenow", currProgress);
    progressBar.style.width = currProgress + "%";
    if (debugState) {
        console.log("current progress is " + currProgress + "% based on " + percentage + "/" + maxProgress);
    }
}


function setProgressMax(resources) {
    let progressBar = progress[0]; //.querySelector("div");
    maxProgress = 110 + (resources * 100);
    progressBar.setAttribute("aria-valuemax", maxProgress);
    if (debugState) {
        console.log("max of progress bar is set to " + maxProgress);
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
    //logMsg("Please reload this webpage and make sure to reconnect cable and flasher if trying to flash another cable or recovering from error.");
    butConnect.disabled = true;
    baudRate.disabled = true;
    butClear.disabled = true;
    butProgram.disabled = true;
    butProgram.textContent = "Reload Web Page To Continue";
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

async function clickSkipWelcome(){
    await saveSettings();
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
    if(debugState){
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
    }
    setProgressMax(chip_files.length);
    updateCoreProgress(25);
    for (let i = 0; i < chip_files.length; i++) {
        if (!("name" in chip_files[i]) || !("offset" in chip_files[i])) {
            errorMsg("Invalid data, cannot load online flash resources");
            toggleUIProgram(false);
        }
        let request_file = url + chip_files[i]["name"];
        let tmp = await fetch(request_file).then((response) => {
            if (response.status >= 400 && response.status < 600) {
                errorMsg("Error! Failed to fetch \"" + request_file + "\" due to error response " + response.status);
                flashingReady = false;
                let consiseError = "Invalid file received from server ";
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
                let consiseError = "Bad response from server, invalid downloaded file size. Cannot continue";
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

async function toggleDevConf(s = true) {
    if (butCustomize.checked) {
        s = false;
    }
    let elems = elementsDevConf.querySelectorAll("input");
    if (elems.length > 1) {
        for (let i = 0; i < elems.length; i++) {
            elems[i].disabled = s;
        }
    }
}


async function clickProgramErase() {
    let shiftkeypress = false;
    document.addEventListener("keydown", (event) => {
        if (event.key == "Shift") {
            shiftkeypress = true;
        }
    });
    document.addEventListener("keyup", (event) => {
        if (event.key == "Shift") {
            shiftkeypress = false;
        }
    });
    if (isConnected) {
        if (shiftkeypress) {
            clickErase();
        } else {
            clickProgram();
        }
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
    logMsg("User requested flash of device using release branch  '" + branch + "'.")
    let bins = await getFirmwareFiles(branch);
    if (debugState) {
        console.log("debug orig memory dump");
        console.log(bins);
    }
    updateCoreProgress(60);
    if (!flashingReady) {
        logMsg("Flashing not ready, an error has occurred, please check log above for more information");
    } else {
        logMsg("Flashing firmware based on code branch " + branch + ". ");
        // erase 
        if (butEraseCable.checked) {
            logMsg("Erasing flash before performing writes. This may take some time... ");
            if (debugState) {
                console.log("performing flash erase before writing");
            }
            await eraseFlash(await espTool.getFlashID());
            logMsg("Erasing complete, continuing with flash process");
            //toggleUIProgram(true);
        }
        // update the bins with patching
        updateCoreProgress(70);
        logMsg("Attempting to perform bit-patching on firmware");
        bins = await patchFlash(bins);
        if (debugState) {
            console.log("debug patched memory dump");
            console.log(bins);
        }
        updateCoreProgress(100);
        // continue
        for (let bin of bins) {
            try {
                let offset = parseInt(bin["offset"], 16);
                let contents = bin["data"];
                let name = bin["name"];
                // write
                logMsg("Attempting to write " + name + " to " + offset);
                await espTool.flashData(contents, offset, name);
                await sleep(1000);
            } catch (e) {
                flash_successful = false;
                errorMsg(e);
                // for good measure
                break;
            }
        }
        if (flash_successful) {
            setStatusAlert("Device Programmed, please reload web page and remove programmer and cable");
            toggleUIProgram(true);
            logMsg("To run the new firmware, please unplug your device and plug into normal USB port.");
            logMsg(" ");
            endHelper();
        } else {
            setStatusAlert("Device flash failed and could not be completed.");
            printSettings(true);
            toggleUIProgram(true);    
            logMsg("Failed to flash device successfully");
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


    const wifiPatcher = (orig_data) => {
        let utf8Encoder = new TextEncoder();
        let mod_array = new Uint8Array(orig_data);

        let perform_patch = false; // set this to true once we verify html elements

        /*let access_log_str = utf8Encoder.encode("access.log"); 
        // search for "access.log", this is a bit more complex then python
        // but it works for what we need and since this is not user interactive
        // we don"t care
        let pos = mod_array.indexOfString(access_log_str);
        let offset = int.from_bytes(BL[pos+24:pos+28], "little");

        let ssid = "testq2345654";
        let pass = "123456789";
        let mode = "2";*/

        let ssid_pos = mod_array.indexOfString(utf8Encoder.encode("SSID "));

        if (ssid_pos > -1 && perform_patch) {
            if (debugState) {
                console.log("found match at " + pos + " for data ");
                console.log(orig_data);
                console.log(search);
            }
            let aligned = 114;
            let ccfg = "SSID " + ssid + " PASS " + pass + " MODE " + mode;
            let cfglen = ccfg.length
            let final_cfg = utf8Encoder.encode(`${ccfg}`.padEnd((aligned), "\0"));

            let re_pos = 0;
            for (let i = ssid_pos; i < ssid_pos + final_cfg.length; i++) {
                mod_array[i] = final_cfg[re_pos];
                re_pos += 1;
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

async function clickDebug(){
	const urlParams = new URLSearchParams(window.location.search);
	if(urlParams.has("debug")){
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
        "web page to continue and disconnect and reconnect cable to flasher. " +
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
        setStatusAlert("Cable Erased, please reload web page and remove programmer and cable");
        logMsg("Erasing complete, please continue with flash process after " +
            "reloading web page (Ctrl+F5) and reconnecting to cable");
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

function toggleUIProgram(state) {
    //isConnected = true;
    if (state) {
        statusStep1.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep1.classList.add("bi-check-circle");
        //switchStep("step-success");
    } else {
        // error
        statusStep1.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep1.classList.add("bi-x-circle");
        setStatusAlert("Flashing failed, you can check log for more information and <br>click \"Show me How\" to get further help.","danger");
        accordionExpand(3);
        btnProgram.getElementsByClassName("spinner-border")[0].classList.add("d-none");
        progress[0].remove("progress-bar-animated");
        accordionDisable();
    }
}

function toggleUIHardware(ready) {
    let lbl = "Connect";
    if (ready) {
        statusStep1.classList.remove("bi-x-circle", "bi-circle", "bi-check-circle");
        statusStep1.classList.add("bi-check-circle");
        accordionExpand(2);
    } else {
        // error
        setStatusAlert("Hardware is unavailable. Click \"Show me How\" to get further help.","danger");
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
        err = "Make sure to select a device to flash, no device found to use. Click \"Show me How\" for more information.";
        setStatusAlert(err, "danger");
        accordionExpand(2);
        accordionDisable();
    }
    butConnect.textContent = lbl;
}

function saveSetting(setting, value) {
	if(debugState){
		console.log("Saving data to setting '" + setting + "' with value '" + value + "'.");
	}
    window.localStorage.setItem(setting, value);
}

function loadSetting(setting) {

	let data = window.localStorage.getItem(setting);
	if(debugState){
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
        butSkipWelcome.checked=true;
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
							if(debugState){
								console.log("Found element with id " + value + " to select to true");
							}
                            element[i].checked = true;
                        } else {
							if(debugState){
								console.log("Searching for element with id " + value + " to select to false");
							}
                            element[i].checked = false;
                        }
                    }
                } else {
                    if (typeof value !== "undefined" && value !== null) {
                    	const t = element.type=="checkbox" ? 'checked' : 'value';
                    	if(debugState){
                    		console.log("\tsettings['"+key+"']['"+t+"']="+value);
                    	}
                    	// this should be as simple as 
                    	// element[t]=value
                    	// but we need some added complexity due to all string inputs
                    	if(t=="value"){
                    		element.value=value;
                    	} else {
                    		// we don't evaluate json anymore so this is how we have to do it
                    		if(value==="true"){
                    			value=true;
                    		} else {
                    			value=false;
                    		}
	                    	element.checked=value;
                    	}
                    } else {
                    	if(debugState){
                    		console.log("element undefined: " + element);
                    	}
                    }
                } 
            } catch(e) {
                console.log("setting: " + key + " is invalid and being skipped");
            	console.error("Exception thrown", e);
            }
        }
    }
}

function printSettings(traceReport=false) {
	let tabs = "\t\t";
	logMsg("")
    logMsg("======================================");
    if(traceReport){
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
            } catch {
            }
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
        butSkipWelcome.checked=true; // so we save our settings
    }
    for (var key in settings) {
        if (settings[key] !== null) {
            let element = settings[key];
            // shouldn't need to double check here but we do right now 
            if(typeof element === "undefined"||element === null) {
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
                    const value = element.type=="checkbox" ? 'checked' : 'value';
                    saveSetting(key,element[value]);
                }
            }
        }
    }

}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
