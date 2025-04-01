import { browse } from "./utils.js";

export const summary = `
Summary of Major U.S. Political Events from October 2024 - February 2025

1. Political Landscape and Policy Shifts

Election Outcome and Congressional Majorities:
Donald Trump won the November 2024 election, marking his second non-consecutive term.
Republicans now hold majorities in both the Senate and House, enabling expedited policy changes.

Executive Actions:
A government-wide hiring freeze was implemented on Day 1.
The administration reinstated Schedule F, altering employment protections for certain federal positions.

Legislative Proposals:
Congressional proposals include modifications to federal payroll, pension contributions, and health benefit subsidies.
Proposed legislation aims to restructure and consolidate agency functions.


2. Reductions in Force (RIFs)

Implementation of Workforce Cuts:
Federal employees received notifications offering a “deferred resignation” option as the first phase of workforce reductions.
Agencies are required to develop reorganization plans that identify positions for elimination based on criteria such as tenure and performance.

Scope and Affected Agencies:
Agencies handling non-critical functions are seeing larger reductions, while those related to national security and law enforcement are largely exempt.

Employee Support Measures:
Affected employees may be eligible for early retirement, voluntary separation incentives, and career transition assistance.
Established procedures mandate a 60-day notice before involuntary separations are finalized.

3. HHS Restructuring and Workforce Changes (March 2025)
HHS Reduction in Force Framework
HHS RIF Procedures: HHS has established procedures for workforce reductions as outlined in HHS Instruction 351-1.
Direct quote: "This Instruction applies to all Operating Divisions (OpDivs) and Staff Divisions (StaffDivs) of the Department. RIF procedures must be applied in a fair and equitable manner without discrimination. OpDivs/StaffDivs must notify HHS Office of Human Resources as early as possible whenever they are considering using a RIF. This may be necessitated by factors such as reorganization, the elimination, or consolidation of functions, or departmental decisions to respond to budgetary constraints."
Source: https://www.hhs.gov/about/agencies/asa/ohr/hr-library/351-1/index.html
Federal Workforce Reduction Options
Voluntary Separation Programs
Voluntary Early Retirement Authority (VERA): Available to eligible employees meeting age and service requirements.

Source: https://www.opm.gov/policy-data-oversight/workforce-restructuring/voluntary-early-retirement-authority/
Voluntary Separation Incentive Payments (VSIP): Provides financial incentives for voluntary resignation.

Direct quote: "An employee who receives a VSIP and later accepts employment for compensation with the Government of the United States within 5 years of the date of the separation on which the VSIP is based, including work under a personal services contract or other direct contract, must repay the entire amount of the VSIP to the agency that paid it - before the individual's first day of reemployment."
Source: https://www.opm.gov/policy-data-oversight/workforce-restructuring/voluntary-separation-incentive-payments/
Reduction in Force Procedures
OPM RIF Guidance: Outlines the standard process for conducting reductions in force.
Direct quote: "When an agency must abolish positions, the RIF regulations determine whether an employee keeps his or her present position, or whether the employee has a right to a different position."
Source: https://www.opm.gov/policy-data-oversight/workforce-restructuring/reductions-in-force/

Current HHS Planning Documents

FY 2025 Budget in Brief: Outlines current departmental priorities and resource allocation plans.
Source: https://www.hhs.gov/about/budget/fy2025/index.html

FY 2025 Annual Performance Plan: Details strategic objectives and performance goals for the department.
Source: https://www.hhs.gov/sites/default/files/fy2025-performance-plan.pdf

Contingency Staffing Plan: Addresses essential operations during potential disruptions.
Source: https://www.hhs.gov/about/budget/fy-2025-hhs-contingency-staffing-plan/index.html

4. Department of Government Efficiency (DOGE)

Establishment and Mandate:
DOGE was established by executive order on February 11, 2025, to review agency operations and coordinate workforce reductions.
Its mandate includes identifying duplicative or non-essential programs and consolidating functions where feasible.
DOGE reports directly to the White House.

Leadership and Structure:
Elon Musk has been appointed as a special advisor to DOGE, providing private-sector expertise in cost reduction and operational efficiency.
Amy Gleason serves as the acting DOGE Administrator, overseeing day-to-day operations.

Initial Actions:
DOGE is enforcing the hiring freeze and reviewing agency reorganization plans.
Non-critical contracts and programs (e.g., the 18F tech innovation team) have been canceled or restructured.


5. Dissolution of the Department of Education and USAID

Department of Education (ED):

Closure Process:
A 90-day review was initiated to outline steps for dismantling the department.
The process requires legislative action for formal termination.

Reassignment of Functions:

K-12 Programs: Expected to be reassigned to state governments or potentially to the Department of Health and Human Services.
Education Data and Research: Functions to be transferred to the Department of Commerce.

Civil Rights Enforcement in Schools: Proposed to shift to the Department of Justice.
Federal Student Aid: Under review for reassignment to the Treasury or reorganization as an independent entity.
Impact on Workforce:

Approximately 3,900 employees face reassignment or separation as the department's functions are redistributed.


U.S. Agency for International Development (USAID):

Funding and Workforce Reduction:
Over 90% of USAID's funding has been cut, leading to significant workforce reductions.
The majority of employees have been placed on administrative leave or are being separated.

Reassignment or Termination of Functions:
Many ongoing contracts and projects have been terminated.
Essential functions, including aspects of disaster relief and global health programs, are being transferred to other agencies (e.g., the State Department or the U.S. Development Finance Corporation).

6. Elimination of the 1102 Contracting Series:

DOGE Implementation:
The Department of Government Efficiency (DOGE) has eliminated the GS-1102 job series (Contracting Officers/Contract Specialists) across federal agencies.
This change was implemented through the February 14th executive order "Implementing the President's Department of Government Efficiency Workforce Optimization Initiative" and reinforced by the February 25th order "Commencing the Reduction of the Federal Bureaucracy."

Rationale:
Move toward a centralized procurement model to eliminate redundant positions across agencies
Initiative to automate routine procurement activities previously handled by 1102 personnel
Structural reorganization to redistribute contracting functions to other job classifications

Impact:
Thousands of federal contracting professionals across agencies have received RIF notices
Current 1102 employees are being offered reassignment to other positions, voluntary separation incentives, or face RIF procedures
Procurement functions are being reorganized under a new model that eliminates traditional contracting specialist roles

Agency Response:
Agencies like HHS are implementing revised procurement structures that consolidate contracting functions
Current contracting staff must choose between reassignment options or separation from federal service
Previous protections for specialized acquisition workforce positions have been rescinded

6. Economic and Social Trends Affecting Federal Employees

Market and Economic Developments:
Financial markets initially responded positively to the political shift, though subsequent federal spending cuts and workforce changes have led to market adjustments.
Increases in Treasury yields and borrowing costs have been noted following policy shifts.

Adjustments to Compensation:
Proposals include freezing federal pay raises.
Increases in employee contributions to pensions and modifications to health benefit subsidies are being considered.

Workplace Policy Changes:
The requirement for full-time office attendance has been reinstated, ending the widespread remote work arrangements.

Support for Transitioning Employees:
Federal employees are offered options such as early retirement, voluntary separation incentives, and career transition assistance programs to support those affected by RIFs.`

export const currentExecutiveOrders = await browse({ url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bpresidential_document_type%5D%5B%5D=executive_order" });

export const customContext = {
  summary,
  currentExecutiveOrders
}