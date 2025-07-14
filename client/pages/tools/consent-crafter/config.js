import { 
    nih_cc_consent_adult_affected_patient, 
    nih_cc_consent_adult_family_member,
    nih_cc_consent_adult_healthy_volunteer,



 } from "./prompts";    

export function getPrompt(value) {
    switch (value) {
        case 'nih_cc_consent_adult_healthy_volunteer':
            return nih_cc_consent_adult_healthy_volunteer;
        case 'nih_cc_consent_adult_affected_patient':
            return nih_cc_consent_adult_affected_patient;
        case 'nih_cc_consent_adult_family_member':
            return nih_cc_consent_adult_family_member;
    }
}

export async function getTemplate(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch template from ${url}: ${response.statusText}`);
    const text = await response.text();
    return text;
}


export const promptTemplates = [
    {
        group: 'nih_cc_consent',
        options: [
            { label: 'Adult healthy volunteer', value: 'nih_cc_consent_adult_healthy_volunteer', prompt: '', template: await getTemplate(`nih-cc-consent-template-2024-04-15.docx`) },
            { label: 'Adult affected patient', value: 'nih_cc_consent_adult_affected_patient', prompt: '', template: await getTemplate(`nih-cc-consent-template-2024-04-15.docx`) },
            { label: 'Adult family member', value: 'nih_cc_consent_adult_family_member', prompt: '', template: await getTemplate(`nih-cc-consent-template-2024-04-15.docx`) },
        ],
    },
    {
        group: 'nih_cc_assent',
        disabled: true,
        options: [
            {
                label: 'Child or cognitive impairment patient',
                value: 'nih_cc_assent_child_cognitive_impairment_patient', 
                prompt: '', 
                template: ''
            },
            { 
                label: 'Child or cognitive impairment family member',
                value: 'nih_cc_assent_child_cognitive_impairment_family_member', 
                prompt: '', 
                template: ''
            }
        ]
    },
    {
        group: 'Lay Person Abstract (LPA)',
        options: [
            { 
                label: 'Adult healthy volunteer', 
                value: 'lpa_adult_healthy_volunteer',
                prompt: '',
                template: await getTemplate(`/templates/lay-person-abstract-template.docx`),
            },
            { 
                label: 'Adult affected patient', 
                value: 'lpa_adult_affected_patient',
                prompt: '',
                template: await getTemplate(`/templates/lay-person-abstract-template.docx`),
            },
            { 
                label: 'Adult family member', 
                value: 'lpa_adult_family_member',
                prompt: '',
                template: await getTemplate(`/templates/lay-person-abstract-template.docx`),
             },
        ]
    }
]