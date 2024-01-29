// WIP 
"use strict";

const wizardFile = 'wizard.json'
const stepsContainer = document.getElementById('steps-container');

function loadWizardJSON() {
	const jsonFilePath = 'data.json';
	
	fetch(jsonFilePath)
	.then(response => response.json())
	.then(data => {
        renderWizard(data);
	})
	.catch(error => console.error('Error reading Wizard JSON file:', error));
}

function generateStepHTML(step) {
    var stepContainer = document.createElement('div');
    stepContainer.classList.add('step');
    stepContainer.id = step.step;

    var h2Element = document.createElement('h2');
    h2Element.textContent = step.step_title;

    if(step.image){
        const imageDiv = document.createElement('div');
        const imageRes = document.createElement('img');
        imageRes.src = step.image
        imageDiv.innerHTML = imageRes;
        stepContainer.appendChild(imageDiv);
    }

    var bodyElement = document.createElement('div');
    bodyElement.classList.add('body');
    bodyElement.innerHTML = step.step_content;

    var buttonContainer = document.createElement('div');
    buttonContainer.classList.add('m-2', 'text-center', 'justify-content-center');

    if (step.help_message) {
      const buttonMoreHelp = document.createElement('button');
      buttonMoreHelp.id = `stepWizard_${step.step}_moreHelp`;
      buttonMoreHelp.classList.add('fancy', 'btn', 'btn-secondary', 'btn-lg');
      buttonMoreHelp.type = 'button';
      buttonMoreHelp.textContent = 'I Need More Help';
      buttonMoreHelp.disabled = true;
      buttonContainer.appendChild(buttonMoreHelp);
    }

    buttonContainer.classList.add('m-2', 'text-center', 'justify-content-center');
    buttonContainer.appendChild(buttonNextStep);

    var buttonNextStep = document.createElement('button');
    buttonNextStep.id = `stepWizard_${step.next_step}`;
    buttonNextStep.classList.add('fancy', 'btn', 'btn-success', 'btn-lg');
    buttonNextStep.type = 'button';
    buttonNextStep.textContent = 'Next';

    stepContainer.appendChild(h2Element);
    stepContainer.appendChild(bodyElement);
    stepContainer.appendChild(buttonContainer);

    buttonNextStep.addEventListener('click', function() {
        handleNextWizardStep(step);
    });

    return stepContainer;
  }

function renderWizard(steps){
    steps.forEach(step => {
        stepsContainer.prepend(generateStepHTML(step));
    });
}

function handleNextWizardStep(step){
    if(doesElementExist(step.name)){
        switchStep(step.next_Step);
    }
}

function doesElementExist(elementId) {
    return !!stepsContainer.getElementById(elementId);
}

document.addEventListener('DOMContentLoaded', function() {
    loadWizardJSON();
});