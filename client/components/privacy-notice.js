import html from "solid-js/html";
import { createResource } from "solid-js";
import { getCookie, setCookie } from "/utils/utils.js"
import Modal from "./modal.js";

export default function PrivacyNotice() {
  const [open, { mutate: setOpen}] = createResource(async () => {
    const session = await fetch("/api/session").then(res => res.json());
    return session.user ? !getCookie("privacyNoticeAccepted") : false;
  });
  const onSubmit = (e) => setCookie("privacyNoticeAccepted", "true");
  const title = html`
    <div class="w-100 text-center">
      <h1 class="font-title fs-4 mb-3">
        Welcome to Research Optimizer <br /> Development Environment
      </h1>
      <div class="small">
        <div class="fw-semibold">
          TERMS, CONDITIONS, AND DISCLAIMER FOR RESEARCH OPTIMIZER PLATFORM
        </div>
        <div>Last Updated: March 18, 2025</div>
      </div>
    </div>
  `;
  return html`
    <${Modal} 
      open=${open}
      setOpen=${setOpen}
      onSubmit=${onSubmit}
      title=${title}
      url="/templates/privacy-notice.md"
      dialogClass=${{"modal-xl" : true}}
      bodyClass=${{"px-5" : true}}
    />`;
}
