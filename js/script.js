// Note: the code will still work without this line, but without it you
// will see an error in the editor
/* global EspLoader, ESP_ROM_BAUD, port, reader, inputBuffer */
"use strict";

var espTool;

const baudRates = [115200];

const bufferSize = 512;
const colors = ["#00a7e9", "#f89521", "#be1e2d"];
const measurementPeriodId = "0001";

const eraseFillByte = 0x00;

const maxLogLength = 100;
const log = document.getElementById("log");
const butConnect = document.getElementById("btnConnect");

// Console Modal
const butClear = document.getElementById("btnClear");
const butDownload = document.getElementById("btnDownload");
const autoscroll = document.getElementById("btnAutoscroll");

// Settings Modal
const elementsDevConf = document.getElementById("deviceConfigOptions");
const butCustomize = document.getElementById("customizeDevice");
const butWifiMode = document.getElementsByName("wifiMode");
const txtSSIDName = document.getElementById("ssidName");
const txtSSIDPass = document.getElementById("ssidPass");

// Programming 
const statusStep1 = document.getElementById("programmerStep1-status");
const statusStep2 = document.getElementById("programmerStep2-status");
const statusStep3 = document.getElementById("programmerStep3-status");
const butProgram = document.getElementById("btnProgram");

const progress = document.querySelectorAll(".progress-bar");


var isConnected = false;

var base_offset = 0;
var colorIndex = 0;
var activePanels = [];
var bytesReceived = 0;
var currentBoard;
var buttonState = 0;
var debugState = false;
var doPreWriteErase = false;
var flashingReady = true;

var logMsgs = [];

const url_memmap = "assets/memmap.json";
const url_base = "https://raw.githubusercontent.com/O-MG/O.MG_Cable-Firmware";


// sourced from
// https://codereview.stackexchange.com/questions/20136/uint8array-indexof-method-that-allows-to-search-for-byte-sequences
Uint8Array.prototype.indexOfString = function(searchElements, fromIndex) {
    fromIndex = fromIndex || 0;
    var index = Array.prototype.indexOf.call(this, searchElements[0], fromIndex);
    if(searchElements.length === 1 || index === -1) {
        return index;
    }
    for(var i = index, j = 0; j < searchElements.length && i < this.length; i++, j++) {
        if(this[i] !== searchElements[j]) {
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
			console.log("Shift Key Pressed");
			butProgram.classList.replace("btn-danger","btn-warning");
			butProgram.innerText = "Erase";
		}
	});
	document.addEventListener('keyup', (event) => {
		if(isConnected && event.key == "Shift") {
			console.log("Shift Key Unpressed");
			butProgram.classList.replace("btn-warning","btn-danger");
			butProgram.innerText = "Program"
		}
	});

	// disable device wifi config by default until user asks
	toggleDevConf(true);
	butCustomize.addEventListener("click", toggleDevConf);
    butProgram.addEventListener("click", clickProgramErase);
    butDownload.addEventListener("click", clickDownload);
    butClear.addEventListener("click",clickClear);
    autoscroll.addEventListener("click", clickAutoscroll);
    baudRate.addEventListener("change", changeBaudRate);
    darkMode.addEventListener("click", clickDarkMode);
    window.addEventListener("error", function(event) {
        console.log("Got an uncaught error: ", event.error)
    });
    if (!("serial" in navigator)) {
    	var unsupportedInfoModal = new bootstrap.Modal(document.getElementById('notSupported'), {
  			keyboard: false
		})
        unsupportedInfoModal.show();
    }
    accordionExpand(1);
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
    let progressBar = progress[part].querySelector("div");
    progressBar.style.width = percentage + "%";
}



/**
 * @name disconnect
 * Closes the Web Serial connection.
 */
async function disconnect() {
    toggleUIConnected(false);
    await espTool.disconnect()
}


async function endHelper(){
	//logMsg("Please reload this webpage and make sure to reconnect cable and flasher if trying to flash another cable or recovering from error.");

    //	toggleUIToolbar(false);

	butProgram.textContent="Reload Web Page To Continue";
	butConnect.disabled=true;	
	baudRate.disabled=true;
	butClear.disabled=true;
	butProgram.disabled=true;
	butProgram.textContent="Reload Web Page To Continue";
	autoscroll.disabled=true;


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
    const blob = new Blob([data], {type: 'text/csv'});
    if(window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveBlob(blob, filename);
    }
    else{
        const elem = window.document.createElement('a');
        elem.href = window.URL.createObjectURL(blob);
        elem.download = filename;        
        document.body.appendChild(elem);
        elem.click();        
        document.body.removeChild(elem);
    }
}

function logMsg(text) {
	const rmsg = (new DOMParser().parseFromString(text, 'text/html')).body.textContent;
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
    bytesReceived = 0;

    // Clear the log
    log.innerHTML = "";
    // Clear the log buffer
    logMsgs = [];
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
        if (debugState) {
            console.log(espTool);
        }
    } catch (e) {
        errorMsg(e);
        await disconnect();
        toggleUIConnected(false);
        return;
    }
    console.log(espTool);
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
    for (let i = 0; i < chip_files.length; i++) {
        if (!("name" in chip_files[i]) || !("offset" in chip_files[i])) {
            errorMsg("Invalid data, cannot load online flash resources");
        }
        let request_file = url + chip_files[i]["name"];
        let tmp = await fetch(request_file).then((response) => {
            if (response.status >= 400 && response.status < 600) {
                errorMsg("Error! Failed to fetch \"" + request_file + "\" due to error response " + response.status);
                flashingReady = false;
                throw new Error("Bad response from server");
            }
            logMsg("Loaded online version of " + request_file + ". ");
            return response.blob();
        }).then((myblob) => myblob).catch((error) => {
            console.log(error)
        });
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
            if(content_length<1||flash_list[i].data.byteLength<1){
            	flashingReady=false;
            	errorMsg("Empty file found for file " + chip_files[i]["name"] + " and url " + request_file + " with size " + content_length);
            	throw new Error("Bad response from server, invalid downloaded file size");
            }
            if (debugState) {
                console.log("data queried for flash size " + chip_flash_size);
                console.log(flash_list);
            }
        }
    }
    return flash_list;
}

async function accordionExpand(item){
	function is_expanded(elem){
		if(elem.classList.contains("show")){
			return true;	
		} else {
			return false;
		}
		
	}
	// this may need to be more specific
	let collapsable_elements = document.querySelectorAll('.collapse');
	for (let i = 0; i < collapsable_elements.length; i++) {
		let element = collapsable_elements[i];
		let element_id = parseInt((element.id).replace("-collapse","").replace("programmerStep",""));
		if(item===element_id){
			if(!is_expanded(element)){
				new bootstrap.Collapse(element);
			}
		} else {
			if(is_expanded(element)){
				new bootstrap.Collapse(element);
			}
		}
	}
}

async function accordionDisable(disabled=true){
	let collapsable_elements = document.querySelectorAll('.accordion-button');
	for (let i = 0; i < collapsable_elements.length; i++) {
		collapsable_elements[i].disabled=disabled;
	}
}

async function toggleDevConf(s=true){
	if(butCustomize.checked){
		s=false;
	}
	let elems = elementsDevConf.querySelectorAll("input");
	if(elems.length>1){
		for(let i = 0; i < elems.length; i++){ 
			elems[i].disabled=s;
		}
	}
}


async function clickProgramErase(){
	document.addEventListener("keydown", (event) => {
		if(isConnected){
			if (event.isComposing || event.key == "Shift") {
				clickProgram();
			} else {
				clickErase();	
			}
		}
	});
}

async function clickProgram() {
    baudRate.disabled = true;
    butProgram.disabled = false;
	let flash_successful = true;
    // and move on
    let branch = String(document.querySelector("#branch").value);
    let bins = await getFirmwareFiles(branch);
    if (debugState) {
        console.log("debug orig memory dump");
        console.log(bins);
    }
    if (!flashingReady) {
        logMsg("Flashing not ready, an error has occurred, please check log above for more information");
    } else {
        logMsg("Flashing firmware based on code branch " + branch + ". ");
        // erase 
        if (doPreWriteErase) {
            logMsg("Erasing flash before performing writes. This may take some time... ");
            if (debugState) {
                console.log("performing flash erase before writing");
            }
            await eraseFlash(await espTool.getFlashID());
            logMsg("Erasing complete, continuing with flash process");
        }
        // update the bins with patching
        logMsg("Attempting to perform bit-patching on firmware");
        bins = await patchFlash(bins);
        if (debugState) {
            console.log("debug patched memory dump");
            console.log(bins);
        }
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
            logMsg("To run the new firmware, please unplug your device and plug into normal USB port.");
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
	let block_split = 4096*4;
	let offset_end_size = offset+ll;
	do {
		let write_size = block_split;
		if((offset_end_size-offset)<block_split){
			write_size = offset_end_size-offset;
		}
		let contents = ((new Uint8Array(write_size)).fill(b)).buffer;
		let status = await espTool.flashData(contents, offset, "blank.bin");	
		console.log(status);
		await sleep(200); // cool down
		offset = offset+block_split;
	} while (offset < offset_end_size);
}

async function clickErase() {
    baudRate.disabled = true;
    butProgram.disabled = false;
	
	var confirm_erase = confirm("Warning: Erasing should only be performed " 
	+ "when recommended by support. This operations will require you to reload the " 
	+ "web page to continue and disconnect and reconnect cable to flasher. "
	+ "Normally this operation is not needed. Are you ready to proceed?");
	
	if(confirm_erase){
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
	saveFile(file_name,raw_log);
}

/**
 * @name checkFirmware
 * Handler for firmware upload changes
 */
async function checkFirmware(event) {
    let filename = event.target.value.split("\\").pop();
    let label = event.target.parentNode.querySelector("span");
    let icon = event.target.parentNode.querySelector("svg");
    if (filename != "") {
        if (filename.length > 17) {
            label.innerHTML = filename.substring(0, 14) + "&hellip;";
        } else {
            label.innerHTML = filename;
        }
        icon.classList.add("hidden");
    } else {
        label.innerHTML = "Choose a file&hellip;";
        icon.classList.remove("hidden");
    }

    //await checkProgrammable();
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

function toggleUIConnected(connected) {
    let lbl = "Connect";
    if (connected) {
    	statusStep2.classList.remove("bi-x-circle","bi-circle","bi-check-circle");
    	statusStep2.classList.add("bi-check-circle");
        lbl = "Disconnect";
    } else {
    	// error
		statusStep2.classList.remove("bi-x-circle","bi-circle","bi-check-circle");
    	statusStep2.classList.add("bi-x-circle");
        lbl = "Error";
        accordionExpand(2);
        accordionDisable();
    }
    butConnect.textContent = lbl;
}

function saveSetting(setting, value) {
    window.localStorage.setItem(setting, JSON.stringify(value));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

