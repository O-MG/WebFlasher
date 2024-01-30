// WIP 
"use strict";

const wizardFile = 'wizard/wizard.json'
const stepsContainer = document.getElementById('steps-container');
const butWizard = document.getElementById("btnWizardStart"); 

let wizardStart = ""

function isHTML(str) {
    return /<[a-z][\s\S]*>/i.test(str);
}

function doesElementExist(elementId) {
    return !!document.getElementById(elementId);
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
    stepContainer.classList.add('step', 'd-none');
    stepContainer.id = `wizard_${step.step}`;

    var h2Element = document.createElement('h2');
    h2Element.textContent = step.title;

    stepContainer.appendChild(h2Element);

    if(step.image){
        let imageDiv = document.createElement('div');
        imageDiv.classList.add('wizard-image',"container");
        let imageRes = document.createElement('img');
        imageRes.classList.add("img-fluid","mw-80")
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
        buttonMoreHelp.id = `btnWizard_${step.step}_help`;
        buttonMoreHelp.classList.add('fancy', 'btn', 'btn-secondary', 'btn-lg');
        buttonMoreHelp.type = 'button';
        buttonMoreHelp.textContent = 'I Need More Help';
        //buttonMoreHelp.disabled = true;
        buttonContainer.appendChild(buttonMoreHelp);
        buttonMoreHelp.addEventListener('click', () => {
            console.log("user asking for help");
            handleExtraHelp(step);
        });
    }

    var buttonNextStep = document.createElement('button');
    buttonNextStep.id = `btnWizard_${step.next_step}`;
    buttonNextStep.classList.add('fancy', 'btn', 'btn-success', 'btn-lg');
    buttonNextStep.type = 'button';
    buttonNextStep.textContent = 'Next';

    buttonContainer.appendChild(buttonNextStep);

    stepContainer.appendChild(bodyElement);
    stepContainer.appendChild(buttonContainer);

    buttonNextStep.addEventListener('click', () => {
        handleNextWizardStep(step);
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
    });
}

function handleExtraHelp(step){
    let curr_step = `wizard_${step.step}`
    let next_step = `wizard_${step.next_step}`
    if(doesElementExist(curr_step)){
        // do nothing right now
        logMsg(`User has requested extra help for step ${curr_step}`)
    }
}

function handleNextWizardStep(step){
    let curr_step = `wizard_${step.step}`
    let next_step = `wizard_${step.next_step}`

    logMsg(`User progressing from '${curr_step}' to ${next_step}.`)
    if(doesElementExist(next_step)){
        var ready = true;
        if (step.validator && (typeof window[step.validator] === 'function')) {
            ready = window[step.validator](step);
        }
        if(ready){
            switchStep(next_step);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadWizard();
    console.log("HERE");
    console.log(wizardStart);
    butWizard.addEventListener('click', async function() {
        if(wizardStart != ""){
            logMsg(`User starting guided wizard for flashing. Initial Step: ${wizardStart}`)
            await switchStep(wizardStart);
        }
    });
});