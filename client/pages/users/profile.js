import { createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../components/alert.js";
import { Status, useAuthContext } from "../../contexts/auth-context.js";
import { alerts, clearAlert, handleError, handleHttpError } from "../../utils/alerts.js";
import RequestLimitIncrease from "./request-limit-increase.js";
import { fetchCachedJson } from "../../utils/static-data.js";

const fetchConfig = () => fetchCachedJson("/api/config");

function UserProfile() {
  const { user, status, setData } = useAuthContext();
  const [config] = createResource(fetchConfig);
  const [saving, setSaving] = createSignal(false);
  const [showSuccess, setShowSuccess] = createSignal(false);

  // Fetch current user session
  const [session] = createResource(async () => {
    try {
      const response = await fetch("/api/v1/session");
      if (!response.ok) {
        await handleHttpError(response, "fetching your profile");
        return null;
      }
      return response.json();
    } catch (err) {
      const error = new Error("Something went wrong while retrieving your profile.");
      error.cause = err;
      handleError(error, "Session API Error");
      return null;
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const formData = new FormData(e.target);
      const profileData = {
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
      };

      const response = await fetch("/api/v1/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        await handleHttpError(response, "saving your profile");
        return;
      }

      const updatedUser = await response.json();
      setData(updatedUser);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      const error = new Error("Something went wrong while saving your profile.");
      error.cause = err;
      handleError(error, "Profile Save Error");
    } finally {
      setSaving(false);
    }
  }

  return html`
    <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
    <${ErrorBoundary}
      fallback=${(error) => {
        handleError(error, "User Profile Error");
        return null;
      }}
    >
      <img
        src="assets/images/users/profile_banner.png"
        alt="Profile Management Banner"
        class="img-fluid object-fit-cover w-100"
        style="height:153px;"
      />
      <div class="container pb-4">
        <!-- Success Banner -->
        <${Show} when=${showSuccess}>
          <div
            class="alert alert-success alert-dismissible fade show position-absolute top-0 start-50 translate-middle-x mt-3"
            role="alert"
          >
            <strong>Success!</strong> Your profile has been updated.
            <button
              type="button"
              class="btn-close"
              onClick=${() => setShowSuccess(false)}
              aria-label="Close"
            ></button>
          </div>
        <//>

        <!-- Error Alert -->
        <${Show} when=${() => status() === Status.ERROR}>
          <div class="alert alert-danger" role="alert">
            An error occurred while loading your profile
          </div>
        <//>

        <!-- Loading State -->
        <${Show} when=${() => status() === Status.LOADING}>
          <div class="d-flex justify-content-center my-5">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        <//>

        <!-- Profile Header -->
        <div class="row position-relative mb-5" style="margin-top:-80px">
          <h1
            class="offset-sm-2 offset-md-3 offset-xl-4 col-auto font-title text-white fw-bold display-5"
          >
            User Profile
          </h1>
        </div>
        <div class="row mt-4 mb-5">
          <h1 class="offset-sm-2 offset-md-3 offset-xl-4 col-auto fs-3">
            ${() => user()?.email || ""}
          </h1>
          <div class="position-relative offset-sm-2 offset-md-3 offset-xl-4">
            <img
              class="position-absolute"
              src="assets/images/users/profile_icon.svg"
              alt="Profile Icon"
              style="
              width: 150px;
              top: -115px;
              left: -75px; 
              transform: translateX(-50%);
              filter: drop-shadow(10px 13px 9px rgba(0, 0, 0, 0.35));
              z-index: 10;
            "
            />
          </div>
        </div>

        <!-- Profile Form -->
        <${Show} when=${() => status() !== Status.LOADING}>
          <form onSubmit=${handleSubmit} class="mb-5">
            <div class="row align-items-center mb-2">
              <!-- Account Type -->
              <label
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >Account Type</label
              >
              <div class="col-sm-3 col-xl-2">
                <div>NIH</div>
              </div>
            </div>

            <div class="row align-items-center mb-2">
              <!-- Email -->
              <label
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >Email</label
              >
              <div class="col-sm-3 col-xl-2">
                <div>${() => user()?.email || ""}</div>
              </div>
            </div>

            <div class="row align-items-center mb-2">
              <!-- First Name -->
              <label
                for="firstName"
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >First Name</label
              >
              <div class="col-sm-3 col-xl-2">
                <input
                  type="text"
                  class="form-control"
                  id="firstName"
                  name="firstName"
                  value=${() => user()?.firstName || ""}
                  placeholder="Enter first name"
                />
              </div>
            </div>

            <div class="row align-items-center mb-2">
              <!-- Last Name -->
              <label
                for="lastName"
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >Last Name</label
              >
              <div class="col-sm-3 col-xl-2">
                <input
                  type="text"
                  class="form-control"
                  id="lastName"
                  name="lastName"
                  value=${() => user()?.lastName || ""}
                  placeholder="Enter last name"
                />
              </div>
            </div>

            <div class="row align-items-center mb-2">
              <!-- Status -->
              <label
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >Status</label
              >
              <div class="col-sm-3 col-xl-2">
                <div class="text-capitalize">${() => user()?.status}</div>
              </div>
            </div>

            <div class="row align-items-center mb-2">
              <!-- Role -->
              <label
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >Role</label
              >
              <div class="col-sm-3 col-xl-2">
                <div class="text-capitalize">${() => user()?.Role?.name}</div>
              </div>
            </div>

            <div class="row align-items-center mb-2">
              <!-- Cost Limit -->
              <label
                class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-3 col-xl-2 align-self-center col-form-label form-label-user fw-semibold"
                >${() => config()?.budgetLabel || ""} Cost Limit ($)</label
              >
              <div class="col-sm-3 col-xl-2">
                <div>
                  ${() => {
                    const currentUser = user();
                    if (currentUser?.budget === null) {
                      return "Unlimited";
                    } else {
                      return currentUser?.budget;
                    }
                  }}
                </div>
              </div>
            </div>
            <div class="row align-items-center mb-4">
              <div class="offset-sm-2 offset-md-3 offset-xl-4 col-sm-4 col-xl-4 align-self-center">
                <${RequestLimitIncrease} session=${() => session()} />
              </div>
            </div>

            <div class="row">
              <!-- Form Buttons -->
              <div class="col-12 mt-4">
                <div class="d-flex gap-2 justify-content-center">
                  <a href="/" class="btn btn-outline-secondary text-decoration-none"> Cancel </a>
                  <button type="submit" class="btn btn-primary" disabled=${saving}>
                    ${() => (saving() ? "Saving..." : "Save Profile")}
                  </button>
                </div>
              </div>
            </div>
          </form>
        <//>
      </div>
    <//>
  `;
}

export default UserProfile;
