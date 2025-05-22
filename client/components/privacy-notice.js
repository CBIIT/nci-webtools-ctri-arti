import html from "solid-js/html";
import {
  For,
  Show,
  createSignal,
  onMount,
  onCleanup,
  createResource,
  createEffect,
} from "solid-js";

/**
 * Privacy Notice Content Structure
 *
 * Contains contents of Privacy Notice stored as an array of objects.
 * Each object has:
 *  - an optional "title" (string)
 *  - a required "type" (string, enum) either 'text' or 'list' - determines content rendering style
 *  - a required "content" (array) containing content items
 *
 * Content items can be:
 *  1. Simple strings - rendered as paragraphs or list items
 *  2. Objects with category headers - for nested lists with headers (e.g., {outerBullet: "Security Protocols", innerBullet: ["item1", "item2"]})
 *  3. Special "text-with-link" objects - for content with embedded hyperlinks, structured as:
 *     {
 *       "type": "text-with-link",
 *       "text": "The full text including link parts<a href="">click me</a>",
 *     }
 */

const privacyNoticeContent = [
  {
    title: "",
    type: "text",
    content: [
      "TERMS, CONDITIONS, AND DISCLAIMER FOR RESEARCH OPTIMIZER PLATFORM",
      "Last Updated: March 18, 2025",
      "",
      "By accessing or using Research Optimizer, you agree to be bound by these Terms, Conditions, and Disclaimer. Please read this document carefully before proceeding.",
    ],
  },
  {
    title: "PLATFORM OVERVIEW:",
    type: "text",
    content: [
      "This is the development/staging tier of Research Optimizer, a secure platform designed specifically for utilizing generative AI in research-related tasks. Please note that this environment is intended solely for testing purposes and should not be used for production.",
    ],
  },
  {
    title: "DATA HANDLING AND PRIVACY",
    type: "list",
    content: [
      "No Data Retention: Research Optimizer does not store or retain any user-submitted data or AI-generated outputs. All data are temporarily cached during active sessions and automatically purged upon session completion. This is the development tier for Research Optimizer and no PII or PHI is allowed.",
      {
        outerBullet: "Acceptable Data Types for this development tier:",
        innerBullet: [
          "De-identified and anonymized clinical data",
          "Publicly available documents, publications, and data",
        ],
      },
      {
        outerBullet: "Prohibited Data in this development tier:",
        innerBullet: [
          "Personally Identifiable Information (PII)",
          "Protected Health Information (PHI)",
          "Sensitive or other pre-decisional data",
          "Any classified information",
        ],
      },
    ],
  },
  {
    title: "USER RESPONSIBILITIES",
    type: "list",
    content: [
      {
        outerBullet: "Output Validation: Users must:",
        innerBullet: [
          "Review and validate all AI-generated outputs",
          "Verify the accuracy and appropriateness of results",
          "Take full responsibility for any decisions based on Research Optimizer outputs",
        ],
      },
      {
        outerBullet: "Bias and Error Reporting:",
        innerBullet: [
          "Monitor for unfair or discriminatory outputs",
          {
            type: "text-with-link",
            text: html`<p>
              Report concerning patterns to&nbsp;
              <a href="mailto:tanna.nelson@nih.gov"
                >Research Optimizer Support</a
              >
            </p>`,
          },
          "Document any systematic errors or biases",
        ],
      },
    ],
  },
  {
    title: "COMPLIANCE REQUIREMENTS",
    type: "list",
    content: [
      {
        outerBullet: "Regulatory Compliance:",
        innerBullet: [
          {
            type: "text-with-link",
            text: html`<p>
              Follow HHS and NIH policies including&nbsp;
              <a
                href="https://wiki.ocio.nih.gov/wiki/index.php/NIH_Artificial_Intelligence_(AI)_Cybersecurity_Guidance"
                rel="noopener noreferrer"
                target="_blank"
                >OCIO Guidance</a
              >,&nbsp;
              <a
                href="https://intranet.hhs.gov/policy/hhs-policy-securing-artificial-intelligence-technology"
                rel="noopener noreferrer"
                target="_blank"
                >HHS policy for Securing Artificial Intelligence (AI)
                Technology</a
              >,&nbsp;
              <a
                href="https://grants.nih.gov/grants/guide/notice-files/NOT-OD-23-149.html"
                rel="noopener noreferrer"
                target="_blank"
                >NOT-OD-23-149 prohibiting Generative AI for NIH Peer Review</a
              >, and any other federal requirements.
            </p>`,
          },
        ],
      },
      {
        outerBullet: "Security Protocols:",
        innerBullet: [
          "Maintain secure access credentials",
          "Report unauthorized access attempts",
          "Follow institutional security guidelines",
        ],
      },
    ],
  },
  {
    title: "PLATFORM LIMITATIONS",
    type: "list",
    content: [
      {
        outerBullet: "Model Characteristics:",
        innerBullet: [
          "Research Optimizer uses commercial AI models",
          "Unless otherwise specified, there is no fine-tuning on NIH/HHS specific content and limited knowledge of internal NIH/HHS processes",
        ],
      },
      {
        outerBullet: "Technical Constraints:",
        innerBullet: [
          "Session time limitations",
          "Processing capacity restrictions",
          "Input/output size limitations",
        ],
      },
    ],
  },
  {
    title: "SECURITY AND INCIDENT REPORTING",
    type: "list",
    content: [
      {
        outerBullet: "Required Actions:",
        innerBullet: [
          "Immediate reporting of suspicious activities",
          "Documentation of technical issues",
          "Notification of potential security breaches",
        ],
      },
      {
        outerBullet: "Contact Procedures:",
        innerBullet: [
          {
            type: "text-with-link",
            text: html`<p>
              Report incidents to&nbsp;
              <a href="mailto:tanna.nelson@nih.gov"
                >Research Optimizer Support</a
              >
            </p>`,
          },
          "Follow institutional incident response protocols",
          "Maintain detailed incident logs",
        ],
      },
    ],
  },
  {
    title: "DISCLAIMER OF WARRANTIES",
    type: "list",
    content: [
      'Research Optimizer is provided "as is" without any warranties, expressed or implied. Users assume all risks associated with platform use. The platform operators are not liable for:',
      "Accuracy of AI-generated content",
      "Decision consequences based on outputs",
      "Data processing results",
      "System availability or performance",
    ],
  },
  {
    title: "USER ACKNOWLEDGEMENT",
    type: "list",
    content: [
      "By using Research Optimizer, you acknowledge that:",
      "You have read and understood these terms",
      "You will comply with all stated requirements",
      "You accept the inherent limitations of AI technology",
      "You will use the platform responsibly and ethically",
      "You will not upload any sensitive and/or identifiable data",
    ],
  },
  {
    title: "MODIFICATIONS",
    type: "text",
    content: [
      "These terms may be updated periodically. Users will be notified of significant changes and must accept updated terms to continue platform access.",
      "",
      "For questions or concerns, contact Research Optimizer Support at tanna.nelson@nih.gov",
    ],
  },
];

export default function PrivacyNotice() {
  const [isScrolledToBottom, setIsScrolledToBottom] = createSignal(false);
  const [modalInstance, setModalInstance] = createSignal(null);
  const [session] = createResource(() =>
    fetch("/api/session").then((res) => res.json())
  );

  const openModal = () => {
    if (modalInstance()) {
      modalInstance()?.show();
    }
  };

  const closeModal = () => {
    if (modalInstance()) {
        const focusedElement = document.activeElement;
        if (focusedElement) {
            focusedElement.blur();
        }
        modalInstance()?.hide();
    }
};

  let modalElement;
  let modalBodyRef;

  createEffect(() => {
    if (session()?.user) {
      openModal();
    }
  });

  onMount(() => {
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: "static", //  prevent modal from closing when clicking outside
        keyboard: false, // Prevent modal from closing when pressing Esc
        show: false, // Initialize the modal, but don't show it immediately.
      });

      setModalInstance(modal);

      if (modalBodyRef) {
        const handleScroll = () => {
          const { scrollTop, scrollHeight, clientHeight } = modalBodyRef;
          if (
            !isScrolledToBottom() &&
            Math.ceil(scrollTop + clientHeight) >= scrollHeight - 1
          ) {
            setIsScrolledToBottom(true);
            modalBodyRef.removeEventListener("scroll", handleScroll);
          }
        };
        modalBodyRef.addEventListener("scroll", handleScroll);
        onCleanup(() => {
          modalBodyRef.removeEventListener("scroll", handleScroll);
        });
      }

      onCleanup(() => {
        modal?.dispose();
        setModalInstance(null);
      });
    }
  });

  return html`
    <!-- Modal -->
    <div
      class="modal fade"
      ref=${(el) => (modalElement = el)}
      id="privacyNotice"
      tabindex="-1"
      aria-labelledby="Privacy Notice"
      aria-hidden="true"
    >
      <div
        class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h1 class="modal-title fs-3" id="privacyNoticeLabel">
              Welcome to Research Optimizer Development Environment
            </h1>
          </div>
          <div class="modal-body" ref=${(el) => (modalBodyRef = el)}>
            <${For} each=${privacyNoticeContent}>
              ${(section) => html`
                <${Show} when=${section.title}>
                  <div class="h6 pt-3">${section.title}</div>
                <//>

                <${Show} when=${section.type === "text"}>
                  <${For} each=${section.content}>
                    ${(part) => html`
                      <${Show} when=${part} fallback=${html` <br />`}>
                        <p>${part}</p>
                      <//>
                    `}
                  <//>
                <//>
                <${Show} when=${section.type === "list"}>
                  <ul>
                    <${For} each=${section.content}>
                      ${(part) => html`
                        <${Show} when=${typeof part === "string"}>
                          <li>${part}</li>
                        <//>
                        <${Show} when=${typeof part === "object"}>
                          <li>
                            ${part.outerBullet}
                            <ul>
                              <${For} each=${part.innerBullet}>
                                ${(inner) => html`
                                  <${Show} when=${typeof inner === "string"}>
                                    <li>${inner}</li>
                                  <//>
                                  <${Show}
                                    when=${typeof inner === "object" &&
                                    inner?.type === "text-with-link" &&
                                    inner?.text}
                                  >
                                    <li>${inner.text}</li>
                                  <//>
                                `}
                              <//>
                            </ul>
                          </li>
                        <//>
                      `}
                    <//>
                  </ul>
                <//>
              `}
            <//>
          </div>
          <div class="modal-footer justify-content-center">
            <button
              type="button"
              class="btn btn-success"
              onClick=${() => closeModal()}
              disabled=${() => !isScrolledToBottom()}
            >
              I Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
