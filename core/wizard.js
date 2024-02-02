// WIP 
"use strict";

const wizardFile = 'wizard/wizard.json'
const helpPanel = document.getElementById('wizard-slideout')
const stepsContainer = document.getElementById('wizard-steps');
const butWizard = document.getElementById("btnWizardStart"); 
const butCloseWizard = document.getElementById("wizard-close-button")

let wizardStart = ""

function isHTML(str) {
    return /<[a-z][\s\S]*>/i.test(str);
}

function doesElementExist(elementId) {
    return !!document.getElementById(elementId);
}


async function wizardStep(activeStep) {
    // this may need to be more specific
    let steps = stepsContainer.getElementsByClassName("wizard-step");
    console.log("in here")
    console.log(steps);
    console.log(activeStep);
    for (let i = 0; i < steps.length; i++) {
        let step = steps[i];
        console.log(activeStep);
        console.log(step);
        if (activeStep === step.id) {
            step.classList.remove("d-none");
        } else {
            step.classList.add("d-none");
        }
    }
}


async function loadWizard() {
	fetch(wizardFile)
	.then(response => {
        if (!response.ok) {
            console.error('Error loading Wizard JSON file. Status:', response.status);
            return null;
        }
        return response.json();
    })
	.then(data => {
        if(data === null){
            return null
        }
        renderWizard(data);
        butWizard.classList.remove("d-none");
	})
	.catch(error => console.error('Error reading Wizard JSON file:', error));
}


function generateStepHTML(step) {
    var stepContainer = document.createElement('div');
    stepContainer.classList.add('wizard-step', 'd-none');
    stepContainer.id = `wizard_${step.step}`;

    var h2Element = document.createElement('h2');
    h2Element.textContent = step.title;
    h2Element.classList.add('pb-2','border-bottom');

    stepContainer.appendChild(h2Element);

    if(step.image){
        let imageDiv = document.createElement('div');
        imageDiv.classList.add('wizard-image',"container");
        let imageRes = document.createElement('img');
        imageRes.classList.add("img-fluid","mw-80","rounded-4","shadow-lg");
        imageRes.src = step.image;
        imageRes.alt = step.step;
        imageDiv.appendChild(imageRes);
        stepContainer.appendChild(imageDiv);
    }

    var bodyElement = document.createElement('div');
    if(isHTML(step.message)){
        bodyElement.innerHTML = step.message;
    } else {
        let innerMsg = document.createElement('p');
        innerMsg.textContent = step.message;
        bodyElement.append(innerMsg)
    }

    var buttonContainer = document.createElement('div');
    buttonContainer.classList.add('m-2', 'text-center', 'justify-content-center');

    if (step.help_message) {
        let buttonMoreHelp = document.createElement('button');
        buttonMoreHelp.id = `btn_wizard_${step.step}_help`;
        buttonMoreHelp.classList.add('fancy', 'btn', 'btn-secondary', 'btn-lg', 'wizard-button');
        buttonMoreHelp.type = 'button';
        buttonMoreHelp.textContent = 'I Need More Help';
        //buttonMoreHelp.disabled = true;
        buttonContainer.appendChild(buttonMoreHelp);
        buttonMoreHelp.addEventListener('click', () => {
            console.log("user asking for help");
            handleExtraHelp(step);
        });
    }
    
    var nextStep;

	// compat 
	if (typeof step.next_step === 'string') {
		nextStep = [{'step':step.next_step,'label':"Next"}];
	} else {
        nextStep = step.next_step;
    }
	for (var i = 0; i < nextStep.length; i++) {
		var step_path = nextStep[i].step;
		var step_label = nextStep[i].label;
		var buttonNextStep = document.createElement('button');
		buttonNextStep.id = `btn_wizard_${step_path}`;
		buttonNextStep.classList.add('fancy', 'btn', 'btn-success', 'btn-lg', 'wizard-button');
		buttonNextStep.type = 'button';
		buttonNextStep.textContent = `${step_label}`;
		buttonContainer.appendChild(buttonNextStep);
	}

    stepContainer.appendChild(bodyElement);
    stepContainer.appendChild(buttonContainer);

    buttonNextStep.addEventListener('click', (e) => {
    	let next_step = e.target.id.replace("btn_wizard_","")
        handleNextWizardStep(step,next_step);
    });
    //console.log(buttonNextStep);
    //console.log(stepContainer)
    return stepContainer;
  }

function renderWizard(steps){
    if(steps.length>=1){
        wizardStart = `wizard_${steps[0].step}`;
    }
    steps.forEach(step => {
        stepsContainer.prepend(generateStepHTML(step));
        console.log(stepsContainer)
        console.log(generateStepHTML(step))
    });
}

function handleExtraHelp(step,clicked_step){
    let curr_step = `wizard_${step.step}`
    let next_step = `wizard_${clicked_step}`
    if(doesElementExist(curr_step)){
        // do nothing right now
        logMsg(`User has requested extra help for step ${curr_step}`)
    }
}

function handleNextWizardStep(step,clicked_step){
    let curr_step = `wizard_${step.step}`
    let next_step = `wizard_${clicked_step}`

    logMsg(`User progressing from '${curr_step}' to ${clicked_step} (${next_step}).`)
    if(doesElementExist(next_step)){
        var ready = true;
        if (step.validator && (typeof window[step.validator] === 'function')) {
            ready = window[step.validator](step);
        }
        if(ready){
            wizardStep(next_step);
        }
    } else {
    	console.log(`Attempting to navigate to nonexistant wizard step ${clicked_step}`)
    }
}

function toggleHelpPanel(){
    helpPanel.classList.toggle("on");
    if(helpPanel.classList.contains("on")){
        butWizard.textContent="Close Help"
    } else {
        butWizard.textContent = "Continue Help"
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadWizard();
    console.log("HERE");
    console.log(wizardStart);
    butWizard.addEventListener('click', async function() {
        if(wizardStart != ""){
            logMsg(`User starting guided wizard for flashing. Initial Step: ${wizardStart}`)
            toggleHelpPanel();
            await wizardStep(wizardStart);

        }
    });
    butCloseWizard.addEventListener('click', () => {
        toggleHelpPanel();
    })
});
