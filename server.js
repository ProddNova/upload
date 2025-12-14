<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<title>Lost Trace Unit – Mappa spot abbandonati</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<!-- Leaflet CSS -->
<link
rel="stylesheet"
href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
crossorigin="anonymous"
/>
<style>
:root {
--bg-main: #020617;
--bg-elevated: #020617;
--bg-panel: rgba(15, 23, 42, 0.98);
--bg-soft: #0b1120;
--accent-main: #2563eb;
--accent-soft: rgba(37, 99, 235, 0.15);
--text-main: #e5e7eb;
--text-dim: #9ca3af;
--border-soft: rgba(148, 163, 184, 0.4);
--shadow-strong: 0 20px 50px rgba(15, 23, 42, 0.95);
--radius-card: 16px;
}
* {
box-sizing: border-box;
}
html, body {
margin: 0;
padding: 0;
height: 100%;
width: 100%;
font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
background: radial-gradient(circle at top, #02081a 0, #020617 45%, #000 100%);
color: var(--text-main);
overflow: hidden;
}
body {
position: relative;
}
.hidden {
display: none !important;
}
/* MAPPA */
#map {
position: fixed;
top: 0;
left: 0;
right: 0;
bottom: 0;
z-index: 1;
cursor: crosshair;
}
/* CROSSHAIR - VISIBILE SOLO SU MOBILE */
#crosshair {
position: fixed;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
width: 24px;
height: 24px;
pointer-events: none;
z-index: 8;
display: none;
}
#crosshair::before,
#crosshair::after {
content: '';
position: absolute;
background: #ff0000;
border: 1px solid #000;
}
#crosshair::before {
width: 16px;
height: 2px;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
}
#crosshair::after {
width: 2px;
height: 16px;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
}
/* TEMPORARY PIN - FIXED POSITION IN MAP COORDINATES */
#temporaryPin {
position: absolute;
width: 32px;
height: 32px;
background: #ff0000;
border-radius: 50%;
border: 3px solid white;
box-shadow: 0 0 10px rgba(0,0,0,0.5);
z-index: 10;
pointer-events: none;
display: none;
transform: translate(-50%, -50%);
}
#temporaryPin::after {
content: '';
position: absolute;
width: 8px;
height: 8px;
background: white;
border-radius: 50%;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
}
/* DOCK LATERALE DESTRO */
#rightDock {
position: fixed;
right: 10px;
top: 10px;
z-index: 30;
display: flex;
flex-direction: column;
gap: 8px;
transition: transform 0.3s ease;
}
#rightDock.collapsed .dock-btn:not(#dockToggleBtn) {
display: none;
}
#rightDock.collapsed #legendContainer {
display: none;
}
.dock-btn {
width: 34px;
height: 34px;
border-radius: 999px;
border: 1px solid var(--border-soft);
background: radial-gradient(circle at top, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 1));
color: var(--text-main);
box-shadow: 0 12px 25px rgba(15, 23, 42, 0.9);
display: flex;
align-items: center;
justify-content: center;
font-size: 16px;
cursor: pointer;
transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.dock-btn:active {
transform: translateY(1px) scale(0.98);
box-shadow: none;
}
.dock-btn.active {
border-color: rgba(59, 130, 246, 0.9);
box-shadow: 0 0 0 1px rgba(15, 23, 42, 1), 0 0 0 2px rgba(37, 99, 235, 0.7);
}
/* FILTER PANEL STYLES - MODIFICATO: CENTRATO E PIU' GRANDE */
#filterPanel {
position: fixed;
left: 50%;
top: 50%;
transform: translate(-50%, -50%);
z-index: 50;
background: rgba(15, 23, 42, 0.98);
border: 1px solid rgba(148, 163, 184, 0.4);
border-radius: 16px;
padding: 20px;
box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
width: 90%;
max-width: 400px;
max-height: 80vh;
overflow-y: auto;
display: none;
}
#filterPanel.show {
display: block;
}
.filter-section {
margin-bottom: 15px;
}
.filter-section-title {
font-size: 14px;
font-weight: 600;
margin-bottom: 8px;
color: var(--text-main);
}
.filter-options {
display: flex;
flex-wrap: wrap;
gap: 6px;
margin-bottom: 10px;
}
.filter-btn {
background: rgba(15, 23, 42, 0.95);
border: 1px solid rgba(55, 65, 81, 1);
border-radius: 999px;
padding: 6px 12px;
font-size: 12px;
color: var(--text-dim);
cursor: pointer;
transition: all 0.2s ease;
}
.filter-btn:hover {
border-color: rgba(148, 163, 184, 0.6);
}
.filter-btn.active {
background: rgba(37, 99, 235, 0.2);
border-color: rgba(37, 99, 235, 0.8);
color: #93c5fd;
}
.checkbox-row {
display: flex;
align-items: center;
gap: 8px;
margin-top: 6px;
font-size: 12px;
color: var(--text-dim);
}
.checkbox-row input[type="checkbox"] {
width: 14px;
height: 14px;
border-radius: 3px;
border: 1px solid rgba(148, 163, 184, 0.4);
background: rgba(15, 23, 42, 0.95);
cursor: pointer;
}
.filter-actions {
display: flex;
gap: 8px;
margin-top: 15px;
}
.filter-actions button {
flex: 1;
padding: 8px;
border-radius: 8px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 0.95);
color: var(--text-dim);
font-size: 12px;
cursor: pointer;
}
.filter-actions button:hover {
background: rgba(55, 65, 81, 0.3);
}
/* OVERLAY PANELS */
.overlay {
position: fixed;
inset: 0;
display: flex;
align-items: center;
justify-content: center;
z-index: 80;
}
.overlay-backdrop {
position: absolute;
inset: 0;
background: rgba(15, 23, 42, 0.8);
backdrop-filter: blur(18px);
-webkit-backdrop-filter: blur(18px);
}
.overlay-card {
position: relative;
z-index: 81;
background: var(--bg-panel);
border-radius: var(--radius-card);
border: 1px solid var(--border-soft);
box-shadow: var(--shadow-strong);
max-width: 480px;
width: calc(100% - 24px);
max-height: calc(100% - 40px);
display: flex;
flex-direction: column;
overflow: hidden;
}
.overlay-header {
padding: 10px 12px;
border-bottom: 1px solid rgba(31, 41, 55, 1);
display: flex;
align-items: center;
justify-content: space-between;
gap: 8px;
}
.overlay-header-title {
display: flex;
flex-direction: column;
gap: 2px;
}
.overlay-header-title strong {
font-size: 13px;
letter-spacing: 0.06em;
text-transform: uppercase;
}
.overlay-header-title small {
font-size: 11px;
color: var(--text-dim);
}
.icon-btn {
width: 26px;
height: 26px;
border-radius: 999px;
border: 1px solid var(--border-soft);
background: radial-gradient(circle at top, rgba(31, 41, 55, 1), rgba(15, 23, 42, 1));
color: var(--text-main);
display: flex;
align-items: center;
justify-content: center;
font-size: 13px;
cursor: pointer;
}
.overlay-body {
padding: 8px 10px 10px;
overflow-y: auto;
flex: 1;
}
/* LISTA SPOT */
#listHeaderActions {
display: flex;
align-items: center;
gap: 6px;
}
#listSearch {
width: 100%;
border-radius: 999px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 0.95);
padding: 7px 9px;
color: var(--text-main);
font-size: 12px;
outline: none;
margin-bottom: 8px;
}
#listSearch::placeholder {
color: rgba(107, 114, 128, 0.9);
}
#listSummary {
font-size: 11px;
color: var(--text-dim);
margin-bottom: 6px;
}
#listContent {
list-style: none;
padding: 0;
margin: 0;
}
.spot-row {
display: flex;
align-items: flex-start;
gap: 8px;
padding: 7px 8px;
border-radius: 14px;
background: radial-gradient(circle at top left, rgba(15, 23, 42, 1), rgba(15, 23, 42, 0.96));
border: 1px solid rgba(31, 41, 55, 1);
margin-bottom: 4px;
cursor: pointer;
transition: all 0.2s ease;
}
.spot-row:hover {
border-color: rgba(59, 130, 246, 0.8);
box-shadow: 0 0 0 1px rgba(15, 23, 42, 1);
}
.spot-row.highlighted {
border-color: #fbbf24;
box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.8), 0 0 10px rgba(251, 191, 36, 0.3);
background: radial-gradient(circle at top left, rgba(30, 41, 59, 1), rgba(15, 23, 42, 0.96));
}
.spot-emoji {
width: 26px;
height: 26px;
border-radius: 999px;
border: 1px solid rgba(15, 23, 42, 1);
display: flex;
align-items: center;
justify-content: center;
background: radial-gradient(circle at top, rgba(17, 24, 39, 1), rgba(15, 23, 42, 1));
font-size: 16px;
flex-shrink: 0;
}
.spot-main {
flex: 1;
min-width: 0;
}
.spot-main-title {
display: flex;
align-items: center;
justify-content: space-between;
gap: 6px;
margin-bottom: 2px;
}
.spot-main-title strong {
font-size: 12px;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
}
.spot-vote-pill {
border-radius: 999px;
padding: 2px 6px;
font-size: 10px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 1);
color: var(--text-dim);
flex-shrink: 0;
}
.spot-desc {
font-size: 11px;
color: var(--text-dim);
max-height: 2.5em;
overflow: hidden;
text-overflow: ellipsis;
}
.spot-meta {
margin-top: 2px;
font-size: 10px;
color: rgba(148, 163, 184, 0.95);
display: flex;
justify-content: space-between;
gap: 6px;
}
/* FORM STYLES */
.form-row {
display: flex;
flex-direction: column;
gap: 3px;
margin-bottom: 6px;
}
.form-row label {
font-size: 11px;
color: var(--text-dim);
}
.input, .textarea, .select {
width: 100%;
border-radius: 12px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 0.95);
padding: 6px 8px;
color: var(--text-main);
font-size: 12px;
outline: none;
}
.textarea {
min-height: 54px;
resize: vertical;
}
.input::placeholder,
.textarea::placeholder {
color: rgba(107, 114, 128, 0.95);
}
.cols {
display: flex;
gap: 6px;
}
.cols .form-row {
flex: 1;
}
.actions-row {
display: flex;
justify-content: flex-end;
gap: 8px;
margin-top: 8px;
}
.btn {
border-radius: 999px;
border: none;
padding: 7px 13px;
font-size: 12px;
cursor: pointer;
display: inline-flex;
align-items: center;
gap: 6px;
font-weight: 500;
transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.btn-primary {
background: linear-gradient(to right, #2563eb, #3b82f6);
color: #f9fafb;
box-shadow: 0 10px 24px rgba(37, 99, 235, 0.9);
}
.btn-secondary {
background: rgba(15, 23, 42, 0.95);
color: var(--text-dim);
border: 1px solid rgba(55, 65, 81, 1);
}
.btn:active {
transform: translateY(1px) scale(0.99);
box-shadow: none;
}
/* VOTO SELECT STYLING - MODIFICATO: NUOVI COLORI */
.voto-option {
display: flex;
align-items: center;
gap: 8px;
padding: 4px 8px;
}
.voto-dot {
width: 10px;
height: 10px;
border-radius: 50%;
display: inline-block;
margin-right: 6px;
border: 1px solid rgba(0,0,0,0.2);
}
.voto-select {
padding: 6px 8px;
-webkit-appearance: none;
-moz-appearance: none;
appearance: none;
background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
background-repeat: no-repeat;
background-position: right 8px center;
background-size: 16px;
padding-right: 32px;
}
/* NUOVI COLORI PER LE OPZIONI DEL SELECT */
option[value="1"] {
color: #6b7280; /* Grigio */
font-weight: bold;
background-color: rgba(107, 114, 128, 0.1);
}
option[value="2"] {
color: #16a34a; /* Verde */
font-weight: bold;
background-color: rgba(22, 163, 74, 0.1);
}
option[value="3"] {
color: #2563eb; /* Blu */
font-weight: bold;
background-color: rgba(37, 99, 235, 0.1);
}
option[value="4"] {
color: #9333ea; /* Viola */
font-weight: bold;
background-color: rgba(147, 51, 234, 0.1);
}
option[value="5"] {
color: #fbbf24; /* Oro */
font-weight: bold;
background-color: rgba(251, 191, 36, 0.1);
}
option[value="6"] {
color: #06b6d4; /* Platino/Azzurro cangiante */
font-weight: bold;
background-color: rgba(6, 182, 212, 0.1);
}
/* SETTINGS */
.settings-section {
margin-bottom: 10px;
border-radius: 12px;
border: 1px solid rgba(31, 41, 55, 1);
padding: 8px 9px;
background: radial-gradient(circle at top, rgba(15, 23, 42, 1), rgba(15, 23, 42, 0.96));
}
.settings-section-title {
font-size: 12px;
font-weight: 600;
margin-bottom: 2px;
}
.settings-section-desc {
font-size: 11px;
color: var(--text-dim);
margin-bottom: 6px;
}
.settings-row {
display: flex;
align-items: center;
gap: 6px;
margin-bottom: 6px;
font-size: 12px;
}
.settings-row label {
flex: 1;
}
.settings-row .input,
.settings-row .select {
flex: 1;
}
#importTextarea,
#exportTextarea {
width: 100%;
border-radius: 10px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 0.95);
color: var(--text-main);
font-size: 11px;
padding: 6px 8px;
min-height: 70px;
resize: vertical;
}
.settings-buttons-row {
display: flex;
gap: 6px;
flex-wrap: wrap;
margin-top: 4px;
}
/* MISSION PANEL */
#missionBodyTitle {
font-size: 12px;
margin-bottom: 4px;
}
#missionBodyCoords {
font-size: 11px;
color: var(--text-dim);
margin-bottom: 8px;
}
#missionText {
width: 100%;
border-radius: 10px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 0.95);
padding: 6px 8px;
color: var(--text-main);
font-size: 11px;
min-height: 90px;
resize: vertical;
}
/* TOAST */
#toast {
position: fixed;
bottom: 14px;
left: 50%;
transform: translateX(-50%);
padding: 7px 12px;
border-radius: 999px;
background: rgba(15, 23, 42, 0.96);
border: 1px solid rgba(148, 163, 184, 0.6);
font-size: 11px;
color: var(--text-main);
opacity: 0;
pointer-events: none;
transition: opacity 0.3s ease, transform 0.3s ease;
z-index: 90;
}
#toast.show {
opacity: 1;
transform: translateX(-50%) translateY(-4px);
}
/* POPUP LEAFLET CUSTOM */
.ltu-popup .popup-title {
font-weight: 600;
margin-bottom: 4px;
font-size: 13px;
color: #ffffff !important;
}
.ltu-popup .popup-desc {
font-size: 11px;
margin-bottom: 4px;
color: var(--text-dim);
max-width: 220px;
white-space: normal;
}
.ltu-popup .popup-meta {
font-size: 10px;
color: rgba(148, 163, 184, 0.95);
margin-bottom: 4px;
}
.ltu-popup a {
font-size: 11px;
color: #93c5fd;
text-decoration: none;
}
.ltu-popup a:hover {
text-decoration: underline;
}
/* OPTIMIZED ROUND MARKERS - SIMILI A GOOGLE MAPS */
.ltu-round-marker {
background: transparent !important;
border: none !important;
box-shadow: none !important;
width: 32px !important;
height: 32px !important;
}

/* Popup Leaflet in stile LTU dark premium */
.leaflet-popup-content-wrapper {
background: var(--bg-panel) !important;
border-radius: 16px !important;
box-shadow: var(--shadow-strong) !important;
border: 1px solid var(--border-soft) !important;
padding: 0 !important;
}

.leaflet-popup-content {
margin: 0 !important;
padding: 14px 16px !important;
min-width: 260px !important;
}

.leaflet-popup-tip {
background: var(--bg-panel) !important;
border: 1px solid var(--border-soft) !important;
box-shadow: var(--shadow-strong) !important;
}

.leaflet-popup-close-button {
color: var(--text-dim) !important;
font-size: 18px !important;
top: 8px !important;
right: 10px !important;
}
/* IMPORT LINK OVERLAY */
#importLinkPanel .overlay-body {
padding: 15px;
}
#importLinkPanel .instructions {
font-size: 12px;
color: var(--text-dim);
margin-bottom: 10px;
}
#importLinkPanel .link-input {
width: 100%;
padding: 10px;
border-radius: 8px;
border: 1px solid var(--border-soft);
background: rgba(15, 23, 42, 0.95);
color: var(--text-main);
margin-bottom: 10px;
font-size: 14px;
}
/* TIPO SELECT STYLING */
.tipo-option {
display: flex;
align-items: center;
gap: 8px;
padding: 4px 0;
}
.tipo-option-emoji {
font-size: 16px;
width: 24px;
text-align: center;
}
.tipo-option-name {
font-size: 12px;
}
/* STREETVIEW OVERLAY */
#streetviewOverlay {
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0,0,0,0.95);
z-index: 1000;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
}
#streetviewIframe {
width: 95%;
height: 85%;
border: none;
border-radius: 12px;
box-shadow: 0 20px 50px rgba(0,0,0,0.8);
}
/* MOBILE ADJUSTMENTS */
@media (max-width: 768px) {
/* Mostra crosshair solo su mobile */
#crosshair {
display: block !important;
}
#map {
cursor: default;
}
#temporaryPin {
display: none !important;
}
.overlay-card {
max-width: 100%;
width: calc(100% - 16px);
max-height: calc(100% - 24px);
}
#rightDock {
right: 6px;
}
#streetviewIframe {
width: 100%;
height: 80%;
border-radius: 0;
}
#filterPanel {
width: 95%;
max-width: 350px;
}
}
/* SYNC STATUS INDICATOR */
#syncStatus {
position: fixed;
bottom: 50px;
left: 50%;
transform: translateX(-50%);
z-index: 35;
padding: 4px 10px;
border-radius: 999px;
font-size: 10px;
background: rgba(15, 23, 42, 0.9);
border: 1px solid rgba(148, 163, 184, 0.4);
color: var(--text-dim);
display: flex;
align-items: center;
gap: 5px;
opacity: 0;
transition: opacity 0.3s;
}
#syncStatus.show {
opacity: 1;
}
#syncStatus.syncing {
color: #3b82f6;
}
#syncStatus.success {
color: #10b981;
}
#syncStatus.error {
color: #ef4444;
}
/* CONFIRM MODAL */
.confirm-modal {
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0, 0, 0, 0.7);
z-index: 10000;
display: flex;
align-items: center;
justify-content: center;
}
.confirm-modal-content {
background: var(--bg-panel);
border-radius: 16px;
padding: 20px;
max-width: 400px;
width: 90%;
border: 1px solid var(--border-soft);
box-shadow: var(--shadow-strong);
}
.confirm-modal-title {
font-size: 16px;
margin-bottom: 10px;
color: var(--text-main);
}
.confirm-modal-message {
font-size: 14px;
color: var(--text-dim);
margin-bottom: 20px;
}
.confirm-modal-buttons {
display: flex;
gap: 10px;
justify-content: flex-end;
}
.confirm-btn {
padding: 8px 16px;
border-radius: 999px;
border: none;
font-size: 14px;
cursor: pointer;
min-width: 80px;
}
.confirm-btn-cancel {
background: rgba(55, 65, 81, 1);
color: var(--text-main);
}
.confirm-btn-confirm {
background: #ef4444;
color: white;
}
/* CERCA CITTA' */
#citySearchContainer {
position: fixed;
top: 10px;
left: 60px;
z-index: 30;
display: flex;
align-items: center;
gap: 6px;
background: rgba(15, 23, 42, 0.95);
border: 1px solid rgba(148, 163, 184, 0.4);
border-radius: 999px;
padding: 4px 12px 4px 16px;
box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
max-width: 300px;
}
#citySearchInput {
background: transparent;
border: none;
color: var(--text-main);
font-size: 12px;
padding: 6px 0;
width: 180px;
outline: none;
}
#citySearchInput::placeholder {
color: rgba(148, 163, 184, 0.7);
}
#citySearchBtn {
background: transparent;
border: none;
color: var(--text-dim);
font-size: 14px;
cursor: pointer;
padding: 4px;
display: flex;
align-items: center;
justify-content: center;
}
#citySearchBtn:hover {
color: var(--text-main);
}
#citySearchResults {
position: absolute;
top: 100%;
left: 0;
right: 0;
background: var(--bg-panel);
border: 1px solid var(--border-soft);
border-radius: 12px;
margin-top: 4px;
max-height: 200px;
overflow-y: auto;
display: none;
z-index: 100;
}
.city-result-item {
padding: 8px 12px;
font-size: 12px;
cursor: pointer;
border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}
.city-result-item:hover {
background: rgba(37, 99, 235, 0.1);
}
.city-result-item:last-child {
border-bottom: none;
}
/* POSIZIONE UTENTE */
#userLocationBtn.active {
border-color: #10b981;
box-shadow: 0 0 0 1px rgba(15, 23, 42, 1), 0 0 0 2px rgba(16, 185, 129, 0.7);
}
.user-location-marker {
background: #10b981;
border-radius: 50%;
border: 3px solid white;
box-shadow: 0 0 10px rgba(0,0,0,0.5);
width: 20px;
height: 20px;
}
.user-location-accuracy {
fill: rgba(16, 185, 129, 0.2);
stroke: #10b981;
stroke-width: 1;
}
/* CHECKBOX ESPLORATO */
.checkbox-row {
display: flex;
align-items: center;
gap: 8px;
margin-top: 4px;
}
.checkbox-row input[type="checkbox"] {
width: 16px;
height: 16px;
border-radius: 4px;
border: 1px solid rgba(148, 163, 184, 0.4);
background: rgba(15, 23, 42, 0.95);
cursor: pointer;
}
.checkbox-row label {
font-size: 11px;
color: var(--text-dim);
cursor: pointer;
}
/* LEGENDA ESPLORATI - MODIFICATO: COLORE ARANCIONE */
#legendContainer {
width: 34px;
height: auto;
border-radius: 999px;
border: 1px solid rgba(148, 163, 184, 0.7);
background: rgba(15, 23, 42, 0.9);
box-shadow: 0 12px 25px rgba(15, 23, 42, 0.9);
padding: 8px 0;
display: flex;
flex-direction: column;
align-items: center;
gap: 4px;
}
.legend-row {
display: flex;
align-items: center;
justify-content: center;
width: 100%;
}
.legend-dot {
width: 12px;
height: 12px;
border-radius: 999px;
display: inline-block;
border: 1px solid #020617;
margin: 0;
}
.legend-number {
font-size: 9px;
color: var(--text-dim);
margin-left: 4px;
min-width: 8px;
}
.legend-explorato {
width: 12px;
height: 12px;
border-radius: 999px;
display: inline-block;
border: 1px solid #020617;
margin: 0;
background: #f97316; /* ARANCIONE invece di verde */
}
.legend-label {
font-size: 9px;
color: var(--text-dim);
margin-left: 4px;
min-width: 8px;
}
/* NOTE PANEL */
#notePanel .overlay-body {
padding: 15px;
}
#noteText {
width: 100%;
border-radius: 12px;
border: 1px solid rgba(55, 65, 81, 1);
background: rgba(15, 23, 42, 0.95);
padding: 12px;
color: var(--text-main);
font-size: 14px;
min-height: 200px;
resize: vertical;
font-family: inherit;
}
/* FILE UPLOAD PER ALLINEAMENTO GMAPS */
.file-upload-btn {
position: relative;
overflow: hidden;
}
.file-upload-btn input[type="file"] {
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 100%;
opacity: 0;
cursor: pointer;
}
</style>
</head>
<body>
<!-- MAPPA -->
<div id="map"></div>
<div id="crosshair"></div>
<div id="temporaryPin"></div>

<!-- FILTRI SPOT -->
<div id="filterPanel">
<div class="filter-section">
<div class="filter-section-title">Filtra per Voto (multiselezione)</div>
<div class="filter-options">
<button class="filter-btn voto-btn" data-voto="all">Tutti</button>
<button class="filter-btn voto-btn" data-voto="1">1</button>
<button class="filter-btn voto-btn" data-voto="2">2</button>
<button class="filter-btn voto-btn" data-voto="3">3</button>
<button class="filter-btn voto-btn" data-voto="4">4</button>
<button class="filter-btn voto-btn" data-voto="5">5</button>
<button class="filter-btn voto-btn" data-voto="6">6</button>
</div>
</div>
<div class="filter-section">
<div class="filter-section-title">Filtra per Tipo (multiselezione)</div>
<div class="filter-options">
<button class="filter-btn tipo-btn" data-tipo="all">Tutti</button>
<button class="filter-btn tipo-btn" data-tipo="hotel">🏨 Hotel</button>
<button class="filter-btn tipo-btn" data-tipo="villa">🏡 Villa</button>
<button class="filter-btn tipo-btn" data-tipo="casa">🏠 Casa</button>
<button class="filter-btn tipo-btn" data-tipo="industria">🏭 Industria</button>
<button class="filter-btn tipo-btn" data-tipo="scuola">🏫 Scuola</button>
<button class="filter-btn tipo-btn" data-tipo="chiesa">⛪ Chiesa</button>
<button class="filter-btn tipo-btn" data-tipo="colonia">🏚️ Colonia</button>
<button class="filter-btn tipo-btn" data-tipo="istituzione">🏥 Istituzione</button>
<button class="filter-btn tipo-btn" data-tipo="svago">🎭 Svago</button>
<button class="filter-btn tipo-btn" data-tipo="castello">🏰 Castello</button>
<button class="filter-btn tipo-btn" data-tipo="nave">🚢 Nave</button>
<button class="filter-btn tipo-btn" data-tipo="diga">💧 Diga</button>
<button class="filter-btn tipo-btn" data-tipo="militare">🪖 Militare</button>
<button class="filter-btn tipo-btn" data-tipo="altro">📍 Altro</button>
</div>
</div>
<div class="checkbox-row">
<input type="checkbox" id="hideExplorati" />
<label for="hideExplorati">Nascondi esplorati</label>
</div>
<div class="filter-actions">
<button id="applyFilters">Applica</button>
<button id="resetFilters">Reset</button>
</div>
</div>

<!-- CERCA CITTA' -->
<div id="citySearchContainer">
<input id="citySearchInput" type="text" placeholder="Cerca città o luogo..." />
<button id="citySearchBtn" title="Cerca">🔍</button>
<div id="citySearchResults"></div>
</div>

<!-- SYNC STATUS -->
<div id="syncStatus"></div>
  
<!-- DOCK DESTRO CON TOGGLE E LEGENDA - AGGIUNTO BOTTONE NOTE -->
<div id="rightDock">
<button id="filterBtn" class="dock-btn" title="Filtra spot">🔍</button>
<button id="userLocationBtn" class="dock-btn" title="Posizione attuale">📍</button>
<button id="importLinkBtn" class="dock-btn" title="Importa link">📎</button>
<button id="settingsBtn" class="dock-btn" title="Impostazioni">⚙️</button>
<button id="btnList" class="dock-btn" title="Lista spot">📋</button>
<button id="btnAdd" class="dock-btn" title="Aggiungi spot">➕</button>
<button id="btnRandom" class="dock-btn" title="Random spot">🎲</button>
<button id="missionBtn" class="dock-btn" title="Missione spot selezionato">📜</button>
<button id="noteBtn" class="dock-btn" title="Note">📝</button> <!-- NUOVO BOTTONE NOTE -->
<div id="legendContainer">
<div class="legend-row"><div class="legend-dot" style="background:#6b7280"></div><span class="legend-number">1</span></div>
<div class="legend-row"><div class="legend-dot" style="background:#16a34a"></div><span class="legend-number">2</span></div>
<div class="legend-row"><div class="legend-dot" style="background:#2563eb"></div><span class="legend-number">3</span></div>
<div class="legend-row"><div class="legend-dot" style="background:#9333ea"></div><span class="legend-number">4</span></div>
<div class="legend-row"><div class="legend-dot" style="background:#fbbf24"></div><span class="legend-number">5</span></div>
<div class="legend-row"><div class="legend-dot" style="background:#06b6d4"></div><span class="legend-number">6</span></div>
<div class="legend-row"><div class="legend-explorato"></div><span class="legend-label">✓</span></div>
</div>
<button id="dockToggleBtn" class="dock-btn" title="Mostra/Nascondi pulsanti">⬆️</button>
</div>

<!-- LIST PANEL -->
<div id="listPanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Lista spot</strong>
<small>Tocca uno spot per centrare la mappa</small>
</div>
<div id="listHeaderActions">
<button id="btnCloseList" class="icon-btn">✕</button>
</div>
</div>
<div class="overlay-body">
<input id="listSearch" type="text" placeholder="Filtra per nome o descrizione..." />
<div id="listSummary"></div>
<ul id="listContent"></ul>
</div>
</div>
</div>

<!-- ADD PANEL -->
<div id="addPanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Nuovo spot</strong>
<small>Lost Trace Unit – aggiungi un punto condiviso</small>
</div>
<button id="btnCloseAdd" class="icon-btn">✕</button>
</div>
<div class="overlay-body">
<form id="addForm">
<div class="form-row">
<label for="fieldName">Nome</label>
<input id="fieldName" class="input" type="text" placeholder="Es. Villa, Casetta, Hotel..." required />
</div>
<div class="form-row">
<label for="fieldDesc">Descrizione</label>
<textarea id="fieldDesc" class="textarea" placeholder="Note, accesso, storia, warning..."></textarea>
</div>
<div class="cols">
<div class="form-row">
<label for="fieldVoto">Voto (1–6)</label>
<select id="fieldVoto" class="select voto-select">
<option value="">Nessun voto</option>
<option value="1" style="color:#6b7280">● 1 - Grigio</option>
<option value="2" style="color:#16a34a">● 2 - Verde</option>
<option value="3" style="color:#2563eb">● 3 - Blu</option>
<option value="4" style="color:#9333ea">● 4 - Viola</option>
<option value="5" style="color:#fbbf24">● 5 - Oro</option>
<option value="6" style="color:#06b6d4">● 6 - Platino</option>
</select>
</div>
<div class="form-row">
<label for="fieldTipo">Tipologia</label>
<select id="fieldTipo" class="select">
<option value="">Auto-rileva</option>
<option value="hotel">🏨 Hotel</option>
<option value="villa">🏡 Villa</option>
<option value="casa">🏠 Casa</option>
<option value="industria">🏭 Industria</option>
<option value="scuola">🏫 Scuola</option>
<option value="chiesa">⛪ Chiesa</option>
<option value="colonia">🏚️ Colonia</option>
<option value="istituzione">🏥 Istituzione</option>
<option value="svago">🎭 Svago</option>
<option value="castello">🏰 Castello</option>
<option value="nave">🚢 Nave</option>
<option value="diga">💧 Diga</option>
<option value="militare">🪖 Militare</option>
<option value="altro">📍 Altro</option>
</select>
</div>
</div>
<div class="cols">
<div class="form-row">
<label for="fieldLat">Latitudine</label>
<input id="fieldLat" class="input" type="text" placeholder="Clicca sulla mappa per posizionare il pin" required />
</div>
<div class="form-row">
<label for="fieldLng">Longitudine</label>
<input id="fieldLng" class="input" type="text" placeholder="Clicca sulla mappa per posizionare il pin" required />
</div>
</div>
<div class="checkbox-row">
<input type="checkbox" id="fieldExplorato" />
<label for="fieldExplorato">Segna come esplorato</label>
</div>
<div class="actions-row">
<button type="button" id="btnUseCurrentPin" class="btn btn-secondary">Usa pin corrente</button>
<button type="submit" class="btn btn-primary">Salva spot</button>
</div>
</form>
</div>
</div>
</div>

<!-- EDIT PANEL -->
<div id="editPanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Modifica spot</strong>
<small>Lost Trace Unit – aggiorna i dettagli</small>
</div>
<button id="btnCloseEdit" class="icon-btn">✕</button>
</div>
<div class="overlay-body">
<form id="editForm">
<input type="hidden" id="editSpotId" /> <!-- ID nascosto per il submit -->
<div class="form-row">
<label for="editFieldName">Nome</label>
<input id="editFieldName" class="input" type="text" placeholder="Es. Villa, Casetta, Hotel..." required />
</div>
<div class="form-row">
<label for="editFieldDesc">Descrizione</label>
<textarea id="editFieldDesc" class="textarea" placeholder="Note, accesso, storia, warning..."></textarea>
</div>
<div class="cols">
<div class="form-row">
<label for="editFieldVoto">Voto (1–6)</label>
<select id="editFieldVoto" class="select voto-select">
<option value="">Nessun voto</option>
<option value="1" style="color:#6b7280">● 1 - Grigio</option>
<option value="2" style="color:#16a34a">● 2 - Verde</option>
<option value="3" style="color:#2563eb">● 3 - Blu</option>
<option value="4" style="color:#9333ea">● 4 - Viola</option>
<option value="5" style="color:#fbbf24">● 5 - Oro</option>
<option value="6" style="color:#06b6d4">● 6 - Platino</option>
</select>
</div>
<div class="form-row">
<label for="editFieldTipo">Tipologia</label>
<select id="editFieldTipo" class="select">
<option value="">Auto-rileva</option>
<option value="hotel">🏨 Hotel</option>
<option value="villa">🏡 Villa</option>
<option value="casa">🏠 Casa</option>
<option value="industria">🏭 Industria</option>
<option value="scuola">🏫 Scuola</option>
<option value="chiesa">⛪ Chiesa</option>
<option value="colonia">🏚️ Colonia</option>
<option value="istituzione">🏥 Istituzione</option>
<option value="svago">🎭 Svago</option>
<option value="castello">🏰 Castello</option>
<option value="nave">🚢 Nave</option>
<option value="diga">💧 Diga</option>
<option value="militare">🪖 Militare</option>
<option value="altro">📍 Altro</option>
</select>
</div>
</div>
<div class="cols">
<div class="form-row">
<label for="editFieldLat">Latitudine</label>
<input id="editFieldLat" class="input" type="text" placeholder="Clicca sulla mappa per posizionare il pin" required />
</div>
<div class="form-row">
<label for="editFieldLng">Longitudine</label>
<input id="editFieldLng" class="input" type="text" placeholder="Clicca sulla mappa per posizionare il pin" required />
</div>
</div>
<div class="checkbox-row">
<input type="checkbox" id="editFieldExplorato" />
<label for="editFieldExplorato">Segna come esplorato</label>
</div>
<div class="actions-row">
<button type="button" id="btnUseCurrentPinEdit" class="btn btn-secondary">Usa pin corrente</button>
<button type="submit" class="btn btn-primary">Salva modifiche</button>
</div>
</form>
</div>
</div>
</div>

<!-- SETTINGS PANEL -->
<div id="settingsPanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Impostazioni LTU</strong>
<small>Stile mappa, random, import/export</small>
</div>
<button id="btnCloseSettings" class="icon-btn">✕</button>
</div>
<div class="overlay-body">
<section class="settings-section">
<div class="settings-section-title">Stile mappa</div>
<div class="settings-section-desc">
Cambia la base map condivisa tra tutti gli utenti.
</div>
<div class="settings-row">
<label for="mapStyleSelect">Tileset</label>
<select id="mapStyleSelect" class="select">
<option value="osm">OSM Standard</option>
<option value="osmHot">OSM Humanitarian</option>
<option value="satellite">Satellite Esri</option>
<option value="satellite2">Satellite Google</option>
<option value="satellite3">Satellite NASA</option>
<option value="topo">OpenTopoMap</option>
<option value="dark">Carto Dark</option>
<option value="cartoLight">Carto Light</option>
<option value="stamenToner">Stamen Toner</option>
<option value="esriTopo">Esri Topo</option>
<option value="esriOcean">Esri Ocean</option>
<option value="esriGray">Esri Gray</option>
</select>
</div>
</section>
<section class="settings-section">
<div class="settings-section-title">Random & missioni</div>
<div class="settings-section-desc">
Come estrarre gli spot casuali per le sessioni LTU.
</div>
<div class="settings-row">
<label for="randomLowRatedCheckbox">
Includi anche spot con voto 1–2 nei random
</label>
<input id="randomLowRatedCheckbox" type="checkbox" />
</div>
</section>
<section class="settings-section">
<div class="settings-section-title">Allinea dati Google Maps</div>
<div class="settings-section-desc">
Carica un file CSV di Google Takeout per trovare spot mancanti nel database.
</div>
<button id="btnAlignGmaps" class="btn btn-secondary file-upload-btn" style="width: 100%;">
📁 Carica CSV Google Takeout
<input type="file" id="gmapsCsvFile" accept=".csv" style="display: none;">
</button>
<div id="gmapsAlignmentStatus" style="margin-top: 8px; font-size: 11px; color: var(--text-dim); display: none;">
</div>
<div id="gmapsMissingSpots" style="margin-top: 8px; display: none;">
<h4 style="font-size: 12px; margin-bottom: 6px;">Spot mancanti trovati:</h4>
<div id="gmapsSpotsList" style="max-height: 150px; overflow-y: auto;"></div>
<button id="btnImportMissingSpots" class="btn btn-primary" style="margin-top: 8px; width: 100%;">
➕ Importa spot selezionati
</button>
</div>
</section>
<section class="settings-section">
<div class="settings-section-title">Import / Export</div>
<div class="settings-section-desc">
Puoi esportare tutti gli spot in CSV per GMaps o importare un JSON semplice.
</div>
<textarea id="importTextarea" placeholder='Incolla qui JSON o CSV da importare...'></textarea>
<div class="settings-buttons-row">
<button id="btnImportJson" class="btn btn-secondary">📥 Importa JSON</button>
<button id="btnExportCsv" class="btn btn-secondary">📤 Export GMaps CSV</button>
</div>
<div style="margin-top:6px;font-size:11px;color:var(--text-dim);">
JSON atteso: array di oggetti con <code>name, desc, lat, lng, voto, explorato</code> oppure
oggetto con <code>places</code>.
</div>
<textarea id="exportTextarea" placeholder="Qui apparirà il CSV generato..." readonly></textarea>
</section>
<div class="actions-row">
<button id="btnSaveAllSettings" class="btn btn-primary">💾 Salva tutte le impostazioni</button>
</div>
</div>
</div>
</div>

<!-- MISSION PANEL -->
<div id="missionPanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Missione LTU</strong>
<small>Briefing sullo spot selezionato</small>
</div>
<button id="btnCloseMission" class="icon-btn">✕</button>
</div>
<div class="overlay-body">
<div id="missionBodyTitle"></div>
<div id="missionBodyCoords"></div>
<textarea id="missionText" placeholder="Scrivi qui il briefing, obiettivi, rischi, note di esplorazione..."></textarea>
<div class="actions-row">
<button id="btnSaveMission" class="btn btn-primary">💾 Salva missione</button>
</div>
</div>
</div>
</div>

<!-- NOTE PANEL - NUOVO -->
<div id="notePanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Note LTU</strong>
<small>Scrivi note, idee, appunti per le tue esplorazioni</small>
</div>
<button id="btnCloseNote" class="icon-btn">✕</button>
</div>
<div class="overlay-body">
<textarea id="noteText" placeholder="Scrivi qui le tue note..."></textarea>
<div class="actions-row">
<button id="btnSaveNote" class="btn btn-primary">💾 Salva note</button>
</div>
</div>
</div>
</div>

<!-- IMPORT LINK PANEL -->
<div id="importLinkPanel" class="overlay hidden">
<div class="overlay-backdrop"></div>
<div class="overlay-card">
<div class="overlay-header">
<div class="overlay-header-title">
<strong>Importa da link Google Maps</strong>
<small>Incolla un link per estrarre coordinate</small>
</div>
<button id="btnCloseImportLink" class="icon-btn">✕</button>
</div>
<div class="overlay-body">
<div class="instructions">
Incolla qui un link di Google Maps (es. https://maps.app.goo.gl/HY2ynACBvCrSzqxd7) 
per estrarre automaticamente le coordinate.
</div>
<input type="text" id="linkInput" class="link-input" placeholder="https://maps.app.goo.gl/..." />
<div class="actions-row">
<button type="button" id="btnDecodeLink" class="btn btn-primary">Decodifica link</button>
</div>
<div id="linkResult" style="margin-top: 10px; display: none;">
<div class="form-row">
<label>Coordinate trovate:</label>
<div style="font-size: 12px; color: #10b981;" id="coordsFound"></div>
</div>
<form id="linkForm">
<div class="form-row">
<label for="linkSpotName">Nome spot</label>
<input type="text" id="linkSpotName" class="input" placeholder="Nome dello spot..." />
</div>
<div class="form-row">
<label for="linkSpotDesc">Descrizione</label>
<textarea id="linkSpotDesc" class="textarea" placeholder="Descrizione..."></textarea>
</div>
<div class="cols">
<div class="form-row">
<label for="linkSpotVoto">Voto (1–6)</label>
<select id="linkSpotVoto" class="select voto-select">
<option value="">Nessun voto</option>
<option value="1" style="color:#6b7280">● 1 - Grigio</option>
<option value="2" style="color:#16a34a">● 2 - Verde</option>
<option value="3" style="color:#2563eb">● 3 - Blu</option>
<option value="4" style="color:#9333ea">● 4 - Viola</option>
<option value="5" style="color:#fbbf24">● 5 - Oro</option>
<option value="6" style="color:#06b6d4">● 6 - Platino</option>
</select>
</div>
<div class="form-row">
<label for="linkSpotTipo">Tipologia</label>
<select id="linkSpotTipo" class="select">
<option value="">Auto-rileva</option>
<option value="hotel">🏨 Hotel</option>
<option value="villa">🏡 Villa</option>
<option value="casa">🏠 Casa</option>
<option value="industria">🏭 Industria</option>
<option value="scuola">🏫 Scuola</option>
<option value="chiesa">⛪ Chiesa</option>
<option value="colonia">🏚️ Colonia</option>
<option value="istituzione">🏥 Istituzione</option>
<option value="svago">🎭 Svago</option>
<option value="castello">🏰 Castello</option>
<option value="nave">🚢 Nave</option>
<option value="diga">💧 Diga</option>
<option value="militare">🪖 Militare</option>
<option value="altro">📍 Altro</option>
</select>
</div>
</div>
<div class="cols">
<div class="form-row">
<label for="linkSpotLat">Latitudine</label>
<input type="text" id="linkSpotLat" class="input" readonly />
</div>
<div class="form-row">
<label for="linkSpotLng">Longitudine</label>
<input type="text" id="linkSpotLng" class="input" readonly />
</div>
</div>
<div class="checkbox-row">
<input type="checkbox" id="linkSpotExplorato" />
<label for="linkSpotExplorato">Segna come esplorato</label>
</div>
<div class="actions-row">
<button type="button" id="btnAddFromLink" class="btn btn-primary">Aggiungi spot</button>
</div>
</form>
</div>
</div>
</div>
</div>

<!-- TOAST -->
<div id="toast"></div>

<!-- Leaflet JS -->
<script
src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
crossorigin="anonymous"
></script>
<script>
// =========================
// UTILS
// =========================
function parseCSVRow(line) {
const result = [];
let current = "";
let inQuotes = false;
for (let i = 0; i < line.length; i++) {
const char = line[i];
if (char === '"') {
if (inQuotes && line[i + 1] === '"') {
current += '"';
i++;
} else {
inQuotes = !inQuotes;
}
} else if (char === "," && !inQuotes) {
result.push(current);
current = "";
} else {
current += char;
}
}
result.push(current);
return result;
}

function parseCSV(text) {
const lines = text.trim().split(/\r?\n/);
const rows = [];
for (const line of lines) {
if (!line.trim()) continue;
rows.push(parseCSVRow(line));
}
return rows;
}

function escapeHtml(str) {
return String(str).replace(/[&<>"']/g, function (c) {
switch (c) {
case "&": return "&amp;";
case "<": return "&lt;";
case ">": return "&gt;";
case '"': return "&quot;";
case "'": return "&#39;";
default: return c;
}
});
}

function extractVoto(desc) {
if (!desc) return null;
const match = desc.match(/Voto:\s*([0-9]+)\s*\/\s*6/i);
if (!match) return null;
const v = parseInt(match[1], 10);
if (v >= 1 && v <= 6) return v;
return null;
}

// NUOVI COLORI IN STILE LTU
function getRatingColor(r) {
if (typeof r !== "number" || !isFinite(r)) return "#000000"; // Nero per nessun voto
if (r === 1) return "#6b7280"; // Grigio
if (r === 2) return "#16a34a"; // Verde
if (r === 3) return "#2563eb"; // Blu
if (r === 4) return "#9333ea"; // Viola
if (r === 5) return "#fbbf24"; // Oro
if (r === 6) return "#06b6d4"; // Platino/Azzurro cangiante
return "#000000";
}

function getTipo(name, desc) {
const text = (name + " " + (desc || "")).toLowerCase();
if (text.includes("hotel") || text.includes("ostello") || text.includes("residence")) return "hotel";
if (text.includes("villa") || text.includes("villone") || text.includes("villino") || text.includes("villetta") || text.includes("ville")) return "villa";
if (text.includes("casa") || text.includes("casetta") || text.includes("casone") || text.includes("case") || text.includes("cascina") || text.includes("casolare")) return "casa";
if (text.includes("fabbrica") || text.includes("capannone") || text.includes("magazzino") || text.includes("distilleria") || text.includes("cantiere") || text.includes("impresa edile") || text.includes("stazione") || text.includes("centro commerciale")) return "industria";
if (text.includes("scuola") || text.includes("itis")) return "scuola";
if (text.includes("chiesa")) return "chiesa";
if (text.includes("colonia")) return "colonia";
if (text.includes("prigione") || text.includes("manicomio") || text.includes("ospedale") || text.includes("clinica") || text.includes("convento")) return "istituzione";
if (text.includes("discoteca") || text.includes("bar") || text.includes("ristorante") || text.includes("pizzeria")) return "svago";
if (text.includes("castello")) return "castello";
if (text.includes("nave")) return "nave";
if (text.includes("diga")) return "diga";
if (text.includes("base nato")) return "militare";
return "altro";
}

function getEmojiByTipo(tipo) {
switch (tipo) {
case "hotel": return "🏨";
case "villa": return "🏡";
case "casa": return "🏠";
case "industria": return "🏭";
case "scuola": return "🏫";
case "chiesa": return "⛪";
case "colonia": return "🏚️";
case "istituzione": return "🏥";
case "svago": return "🎭";
case "castello": return "🏰";
case "nave": return "🚢";
case "diga": return "💧";
case "militare": return "🪖";
default: return "📍";
}
}

function showToast(msg, type = "info") {
const t = document.getElementById("toast");
if (!t) return;
  
// Set color based on type
if (type === "error") {
t.style.background = "rgba(239, 68, 68, 0.9)";
t.style.borderColor = "#ef4444";
} else if (type === "success") {
t.style.background = "rgba(34, 197, 94, 0.9)";
t.style.borderColor = "#22c55e";
} else if (type === "warning") {
t.style.background = "rgba(245, 158, 11, 0.9)";
t.style.borderColor = "#f59e0b";
} else {
t.style.background = "rgba(15, 23, 42, 0.96)";
t.style.borderColor = "rgba(148, 163, 184, 0.6)";
}
  
t.textContent = msg;
t.classList.add("show");
setTimeout(() => t.classList.remove("show"), 1700);
setTimeout(() => {
t.classList.remove("show");
// Reset to default after hiding
setTimeout(() => {
t.style.background = "";
t.style.borderColor = "";
}, 300);
}, 2500);
}
    
// =========================
// ENHANCED FETCH WITH RETRY
// =========================
let retryAttempts = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
    
async function fetchWithRetry(url, options = {}, maxRetries = MAX_RETRIES) {
let lastError;
      
for (let attempt = 0; attempt <= maxRetries; attempt++) {
try {
const response = await fetch(url, options);
          
// Check for HTTP errors
if (!response.ok) {
// Try to parse error response
let errorData;
try {
errorData = await response.json();
} catch {
errorData = { error: `HTTP ${response.status}` };
}
            
// Don't retry on client errors (4xx) except 429
if (response.status >= 400 && response.status < 500 && response.status !== 429) {
throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
}
            
// Retry on server errors (5xx) or 429
if (attempt < maxRetries) {
const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
await new Promise(resolve => setTimeout(resolve, delay));
continue;
}
            
throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
}
          
// Parse successful response
const result = await response.json();
          
// Check for backend success flag
if (result.success === false) {
throw new Error(result.error || result.message || "Operazione fallita");
}
          
return result;
          
} catch (error) {
lastError = error;
          
// Show sync status
updateSyncStatus(`Tentativo ${attempt + 1}/${maxRetries + 1} fallito`, "error");
          
if (attempt < maxRetries) {
const delay = RETRY_DELAY * Math.pow(2, attempt);
await new Promise(resolve => setTimeout(resolve, delay));
}
}
}
      
throw lastError;
}
    
// =========================
// SYNC STATUS INDICATOR
// =========================
function updateSyncStatus(message, type = "info") {
const statusEl = document.getElementById("syncStatus");
if (!statusEl) return;
      
statusEl.textContent = message;
statusEl.className = type;
statusEl.classList.add("show");
      
// Auto-hide after 3 seconds for success, 5 seconds for error
const hideTime = type === "success" ? 3000 : 5000;
setTimeout(() => {
statusEl.classList.remove("show");
}, hideTime);
}
    
// =========================
// CONFIRM DIALOG
// =========================
function showConfirm(title, message) {
return new Promise((resolve) => {
// Remove existing modal if any
const existingModal = document.querySelector('.confirm-modal');
if (existingModal) existingModal.remove();
        
const modal = document.createElement('div');
modal.className = 'confirm-modal';
modal.innerHTML = `
<div class="confirm-modal-content">
<div class="confirm-modal-title">${title}</div>
<div class="confirm-modal-message">${message}</div>
<div class="confirm-modal-buttons">
<button class="confirm-btn confirm-btn-cancel">Annulla</button>
<button class="confirm-btn confirm-btn-confirm">Conferma</button>
</div>
</div>
`;
        
document.body.appendChild(modal);
        
const cancelBtn = modal.querySelector('.confirm-btn-cancel');
const confirmBtn = modal.querySelector('.confirm-btn-confirm');
        
cancelBtn.onclick = () => {
modal.remove();
resolve(false);
};
        
confirmBtn.onclick = () => {
modal.remove();
resolve(true);
};
        
// Close on backdrop click
modal.onclick = (e) => {
if (e.target === modal) {
modal.remove();
resolve(false);
}
};
        
// Close on Escape key
const handleEscape = (e) => {
if (e.key === 'Escape') {
modal.remove();
document.removeEventListener('keydown', handleEscape);
resolve(false);
}
};
document.addEventListener('keydown', handleEscape);
});
}

// =========================
// GLOBAL STATE
// =========================
let map;
let markersLayer;
let baseLayers = {};
let appSettings = {
baseLayer: "osm",
mapStyle: "default",
randomIncludeLowRated: false,
crosshairEnabled: false
};
let allSpots = []; // tutti (solo dal DB)
let filteredSpots = []; // spot filtrati
let currentSpot = null; // ultimo spot cliccato (per missioni / random)
let missions = {}; // localStorage
let notes = {}; // localStorage per le note
let lastAddedSpotId = null; // per centrare spot appena aggiunto
let spotToHighlight = null; // ID dello spot da evidenziare nella lista
let temporaryPin = { lat: null, lng: null, element: null }; // Pin temporaneo per PC
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let pendingOperations = 0; // Contatore operazioni in corso
let userLocationMarker = null; // Marker posizione utente
let userLocationCircle = null; // Cerchio accuratezza posizione
let userLocationWatchId = null; // ID del watcher per posizione
let isUserLocationActive = false; // Stato posizione utente
let currentViewCenter = null; // Per mantenere la vista dopo modifiche
let currentViewZoom = null; // Per mantenere lo zoom dopo modifiche
let hasLocationPermission = false; // Permesso posizione già concesso
let isFirstLocationUpdate = true; // Prima volta che aggiorniamo la posizione
let gmapsMissingSpots = []; // Spot mancanti trovati in GMaps

// FILTER STATE MODIFICATO: ora supporta array per selezioni multiple
let filterState = {
voti: [], // array di voti selezionati (es: [5, 6])
tipi: [], // array di tipi selezionati (es: ["villa", "hotel"])
hideExplorati: false
};

function loadMissions() {
try {
const raw = localStorage.getItem("ltu_missions_v1");
if (!raw) {
missions = {};
return;
}
missions = JSON.parse(raw) || {};
} catch (e) {
missions = {};
}
}

function saveMissions() {
try {
localStorage.setItem("ltu_missions_v1", JSON.stringify(missions));
} catch (e) {}
}

// NUOVA FUNZIONE PER NOTE
function loadNotes() {
try {
const raw = localStorage.getItem("ltu_notes_v1");
if (!raw) {
notes = { general: "" };
return;
}
notes = JSON.parse(raw) || { general: "" };
} catch (e) {
notes = { general: "" };
}
}

function saveNotes() {
try {
localStorage.setItem("ltu_notes_v1", JSON.stringify(notes));
} catch (e) {}
}

function spotKey(p) {
return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

async function loadSettings() {
try {
updateSyncStatus("Caricamento impostazioni...", "syncing");
const result = await fetchWithRetry("/api/settings");
const data = result.data;
appSettings = Object.assign({}, appSettings, data || {});

// Carica impostazioni locali
const localSettings = localStorage.getItem("ltu_local_settings");
if (localSettings) {
const local = JSON.parse(localSettings);
appSettings.crosshairEnabled = local.crosshairEnabled || false;
}
        
updateSyncStatus("Impostazioni caricate", "success");
} catch (e) {
console.warn("Impossibile caricare settings, uso default.");
updateSyncStatus("Errore caricamento impostazioni", "error");
}
}

async function saveSettings(partial) {
appSettings = Object.assign({}, appSettings, partial || {});
try {
updateSyncStatus("Salvataggio impostazioni...", "syncing");
        
const result = await fetchWithRetry("/api/settings", {
method: "POST",
headers: { 
"Content-Type": "application/json",
"Authorization": "Basic " + btoa("unit:ltunit")
},
body: JSON.stringify({
baseLayer: appSettings.baseLayer,
mapStyle: appSettings.mapStyle,
randomIncludeLowRated: appSettings.randomIncludeLowRated
})
});
        
const data = result.data;
appSettings.baseLayer = data.baseLayer || appSettings.baseLayer;
appSettings.mapStyle = data.mapStyle || appSettings.mapStyle;
appSettings.randomIncludeLowRated = data.randomIncludeLowRated || appSettings.randomIncludeLowRated;
        
updateSyncStatus("Impostazioni salvate", "success");
} catch (e) {
console.warn("Errore salvataggio settings", e);
updateSyncStatus("Errore salvataggio settings", "error");
showToast(`Errore salvataggio settings: ${e.message}`, "error");
}
}

function saveLocalSettings() {
try {
localStorage.setItem("ltu_local_settings", JSON.stringify({
crosshairEnabled: appSettings.crosshairEnabled
}));
} catch (e) {
console.warn("Errore salvataggio settings locali", e);
}
}

async function loadExtraSpots() {
try {
updateSyncStatus("Caricamento spot...", "syncing");
const result = await fetchWithRetry("/api/spots-extra");
const arr = result.data;
if (!Array.isArray(arr)) {
updateSyncStatus("Formato dati non valido", "error");
return [];
}
        
const spots = arr.map(raw => {
const lat = parseFloat(raw.lat);
const lng = parseFloat(raw.lng);
if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
const name = raw.name || "";
const desc = raw.desc || "";
const voto = raw.voto != null ? parseInt(raw.voto, 10) : extractVoto(desc);
const tipo = raw.tipo || getTipo(name, desc);
const explorato = raw.explorato || false;
return {
id: raw.id,
name,
desc,
lat,
lng,
voto: (voto >= 1 && voto <= 6) ? voto : null,
tipo,
explorato,
source: "extra",
createdAt: raw.createdAt || null,
updatedAt: raw.updatedAt || null
};
}).filter(Boolean);
        
updateSyncStatus(`${spots.length} spot caricati`, "success");
return spots;
} catch (e) {
console.warn("Errore caricando spots-extra", e);
updateSyncStatus("Errore caricamento spot", "error");
showToast("Errore caricamento spot", "error");
return [];
}
}

async function reloadAllSpots(keepView = false) {
try {
pendingOperations++;
updateSyncStatus("Aggiornamento spot...", "syncing");
        
// Salva la vista corrente se richiesto
if (keepView && map) {
currentViewCenter = map.getCenter();
currentViewZoom = map.getZoom();
}
        
// Carica solo dal database
const spots = await loadExtraSpots();
        
allSpots = spots;
// Applica filtri correnti
applyFilters();
        
// Ripristina la vista se richiesto
if (keepView && currentViewCenter && currentViewZoom) {
map.setView(currentViewCenter, currentViewZoom);
}
        
updateSyncStatus(`${allSpots.length} spot caricati`, "success");
} catch (e) {
console.error(e);
showToast("Errore nel caricamento degli spot.", "error");
updateSyncStatus("Errore caricamento spot", "error");
} finally {
pendingOperations--;
}
}

// =========================
// FILTER FUNCTIONS MODIFICATE
// =========================
function applyFilters() {
filteredSpots = allSpots.filter(spot => {
// Filtro voti (multiselezione)
if (filterState.voti.length > 0) {
// Se l'array contiene "all", salta il filtro
if (!filterState.voti.includes("all")) {
if (!spot.voto || !filterState.voti.includes(spot.voto.toString())) {
return false;
}
}
}
  
// Filtro tipi (multiselezione)
if (filterState.tipi.length > 0) {
// Se l'array contiene "all", salta il filtro
if (!filterState.tipi.includes("all")) {
if (!spot.tipo || !filterState.tipi.includes(spot.tipo)) {
return false;
}
}
}
  
// Filtro esplorati
if (filterState.hideExplorati && spot.explorato) {
return false;
}
  
return true;
});
  
// Renderizza i marker filtrati
renderMarkers();
renderList();
  
// Aggiorna pulsante filtro
const filterBtn = document.getElementById('filterBtn');
if (filterBtn) {
const total = allSpots.length;
const filtered = filteredSpots.length;
if (filtered < total) {
filterBtn.title = `Filtri attivi: ${filtered}/${total} spot`;
filterBtn.classList.add('active');
} else {
filterBtn.title = 'Filtra spot';
filterBtn.classList.remove('active');
}
}
}

function resetFilters() {
filterState = {
voti: [],
tipi: [],
hideExplorati: false
};
  
// Reset UI
document.querySelectorAll('.filter-btn').forEach(btn => {
btn.classList.remove('active');
});
document.querySelector('.voto-btn[data-voto="all"]').classList.add('active');
document.querySelector('.tipo-btn[data-tipo="all"]').classList.add('active');
document.getElementById('hideExplorati').checked = false;
  
applyFilters();
showToast("Filtri resettati", "info");
}

function initFilters() {
const filterPanel = document.getElementById('filterPanel');
const filterBtn = document.getElementById('filterBtn');
const applyBtn = document.getElementById('applyFilters');
const resetBtn = document.getElementById('resetFilters');
const hideExplorati = document.getElementById('hideExplorati');
  
// Toggle panel
filterBtn.addEventListener('click', () => {
filterPanel.classList.toggle('show');
});
  
// Chiudi panel quando clicchi fuori
document.addEventListener('click', (e) => {
if (!e.target.closest('#filterPanel') && !e.target.closest('#filterBtn')) {
filterPanel.classList.remove('show');
}
});
  
// Filtri voto (multiselezione)
document.querySelectorAll('.voto-btn').forEach(btn => {
btn.addEventListener('click', () => {
const voto = btn.dataset.voto;
const index = filterState.voti.indexOf(voto);
  
if (voto === "all") {
// Se clicco "Tutti", deseleziono tutto e attivo solo "all"
document.querySelectorAll('.voto-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
filterState.voti = ["all"];
} else {
// Rimuovo "all" se presente
const allIndex = filterState.voti.indexOf("all");
if (allIndex !== -1) {
filterState.voti.splice(allIndex, 1);
document.querySelector('.voto-btn[data-voto="all"]').classList.remove('active');
}
  
if (index === -1) {
// Aggiungo il voto
btn.classList.add('active');
filterState.voti.push(voto);
} else {
// Rimuovo il voto
btn.classList.remove('active');
filterState.voti.splice(index, 1);
}
  
// Se non ci sono voti selezionati, seleziono "all"
if (filterState.voti.length === 0) {
document.querySelector('.voto-btn[data-voto="all"]').classList.add('active');
filterState.voti = ["all"];
}
}
});
});
  
// Filtri tipo (multiselezione)
document.querySelectorAll('.tipo-btn').forEach(btn => {
btn.addEventListener('click', () => {
const tipo = btn.dataset.tipo;
const index = filterState.tipi.indexOf(tipo);
  
if (tipo === "all") {
// Se clicco "Tutti", deseleziono tutto e attivo solo "all"
document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
filterState.tipi = ["all"];
} else {
// Rimuovo "all" se presente
const allIndex = filterState.tipi.indexOf("all");
if (allIndex !== -1) {
filterState.tipi.splice(allIndex, 1);
document.querySelector('.tipo-btn[data-tipo="all"]').classList.remove('active');
}
  
if (index === -1) {
// Aggiungo il tipo
btn.classList.add('active');
filterState.tipi.push(tipo);
} else {
// Rimuovo il tipo
btn.classList.remove('active');
filterState.tipi.splice(index, 1);
}
  
// Se non ci sono tipi selezionati, seleziono "all"
if (filterState.tipi.length === 0) {
document.querySelector('.tipo-btn[data-tipo="all"]').classList.add('active');
filterState.tipi = ["all"];
}
}
});
});
  
// Checkbox esplorati
hideExplorati.addEventListener('change', (e) => {
filterState.hideExplorati = e.target.checked;
});
  
// Pulsanti azioni
applyBtn.addEventListener('click', () => {
applyFilters();
filterPanel.classList.remove('show');
showToast("Filtri applicati", "success");
});
  
resetBtn.addEventListener('click', resetFilters);
  
// Inizializza con "all" selezionato
document.querySelector('.voto-btn[data-voto="all"]').classList.add('active');
document.querySelector('.tipo-btn[data-tipo="all"]').classList.add('active');
filterState.voti = ["all"];
filterState.tipi = ["all"];
}

// =========================
// MAPPA
// =========================
function initMap() {
// Configurazione mappa
const mapOptions = { 
zoomControl: false,
gestureHandling: true,
maxZoom: 22,
minZoom: 1,
preferCanvas: true // USARE CANVAS PER PERFORMANCE MIGLIORI
};

map = L.map("map", mapOptions);

// Definisci tutti i layer di mappa
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
maxZoom: 22,
attribution: "&copy; OpenStreetMap contributors"
});

const osmHot = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
maxZoom: 22,
attribution: "&copy; OpenStreetMap contributors, Tiles style by HOT"
});

const esriSatellite = L.tileLayer(
"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
{
maxZoom: 22,
attribution: "Tiles &copy; Esri"
}
);

// Satellite alternativo 1 (NASA GIBS)
const nasaGibs = L.tileLayer(
"https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg",
{
maxZoom: 9,
attribution: "Imagery provided by NASA GIBS",
tileMatrixSet: "GoogleMapsCompatible_Level9",
time: "2023-06-01",
subdomains: "abc",
bounds: [[-85.0511, -180], [85.0511, 180]]
}
);

// Satellite alternativo 2 (Google Satellite style)
const googleSatellite = L.tileLayer(
"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
{
maxZoom: 22,
attribution: "Google Satellite"
}
);

// OpenTopoMap
const openTopoMap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
maxZoom: 17,
attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
});

// Carto Dark
const cartoDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
maxZoom: 22,
attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
subdomains: 'abcd'
});

// Carto Light
const cartoLight = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
maxZoom: 22,
attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
subdomains: 'abcd'
});

// Stamen Toner (funziona meglio di watercolor)
const stamenToner = L.tileLayer("https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png", {
maxZoom: 20,
attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
subdomains: 'abcd'
});

// Esri WorldTopoMap
const esriTopo = L.tileLayer(
"https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
{
maxZoom: 22,
attribution: "Tiles &copy; Esri"
}
);

// Esri OceanBasemap
const esriOcean = L.tileLayer(
"https://server.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/{z}/{y}/{x}",
{
maxZoom: 22,
attribution: "Tiles &copy; Esri"
}
);

// Esri Gray
const esriGray = L.tileLayer(
"https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
{
maxZoom: 22,
attribution: "Tiles &copy; Esri"
}
);

// Mappe che funzionano (rimuoviamo quelle che non caricano)
baseLayers = {
osm,
osmHot,
satellite: esriSatellite,
satellite2: googleSatellite,
satellite3: nasaGibs,
topo: openTopoMap,
dark: cartoDark,
cartoLight,
stamenToner,
esriTopo,
esriOcean,
esriGray
};

// Applica baseLayer da settings
let chosen = baseLayers[appSettings.baseLayer] || osm;
chosen.addTo(map);

// Crea layer group per marker
markersLayer = L.layerGroup().addTo(map);

// Inizializza con vista Italia
map.setView([44.5, 8.9], 7);

// Gestione click sulla mappa per PC e mobile
map.on("click", function (e) {
const lat = e.latlng.lat;
const lng = e.latlng.lng;

// Salva coordinate per pin temporaneo
temporaryPin.lat = lat;
temporaryPin.lng = lng;

// Mostra pin temporaneo su PC
if (!isMobile) {
showTemporaryPin(lat, lng);
}

// Aggiorna i campi dei form se aperti
updateFormCoordinates(lat, lng);
});

// Gestione contextmenu (tasto destro) per rimuovere pin
map.on("contextmenu", function(e) {
e.originalEvent.preventDefault();
removeTemporaryPin();
return false;
});

// Disabilita menu contestuale sulla mappa
const mapContainer = map.getContainer();
mapContainer.addEventListener('contextmenu', function(e) {
e.preventDefault();
return false;
});

// Inizializza crosshair in base alle impostazioni
updateCrosshairVisibility();
}

function showTemporaryPin(lat, lng) {
// Crea pin se non esiste
if (!temporaryPin.element) {
temporaryPin.element = document.getElementById('temporaryPin');
if (!temporaryPin.element) {
const pin = document.createElement('div');
pin.id = 'temporaryPin';
document.body.appendChild(pin);
temporaryPin.element = pin;
}
}

const pinEl = temporaryPin.element;
if (!pinEl) return;

// Converti coordinate lat/lng a pixel nella mappa
const point = map.latLngToContainerPoint([lat, lng]);
      
// Posiziona il pin assolutamente rispetto alla mappa
const mapRect = map.getContainer().getBoundingClientRect();
pinEl.style.position = 'absolute';
pinEl.style.left = (mapRect.left + point.x) + 'px';
pinEl.style.top = (mapRect.top + point.y) + 'px';
pinEl.style.display = 'block';

// Aggiorna posizione quando la mappa si muove
if (!temporaryPin.moveHandler) {
temporaryPin.moveHandler = function() {
if (temporaryPin.lat && temporaryPin.lng) {
const newPoint = map.latLngToContainerPoint([temporaryPin.lat, temporaryPin.lng]);
const mapRect = map.getContainer().getBoundingClientRect();
pinEl.style.left = (mapRect.left + newPoint.x) + 'px';
pinEl.style.top = (mapRect.top + newPoint.y) + 'px';
}
};
map.on('move', temporaryPin.moveHandler);
map.on('resize', temporaryPin.moveHandler);
}
}

function removeTemporaryPin() {
if (temporaryPin.element) {
temporaryPin.element.style.display = 'none';
}
temporaryPin.lat = null;
temporaryPin.lng = null;

// Rimuovi handler per evitare memory leak
if (temporaryPin.moveHandler) {
map.off('move', temporaryPin.moveHandler);
map.off('resize', temporaryPin.moveHandler);
temporaryPin.moveHandler = null;
}
}

function updateFormCoordinates(lat, lng) {
// Aggiorna i campi dei form se aperti
const latInput = document.getElementById("fieldLat");
const lngInput = document.getElementById("fieldLng");
const editLatInput = document.getElementById("editFieldLat");
const editLngInput = document.getElementById("editFieldLng");
const linkLatInput = document.getElementById("linkSpotLat");
const linkLngInput = document.getElementById("linkSpotLng");

if (latInput && lngInput) {
latInput.value = lat.toFixed(6);
lngInput.value = lng.toFixed(6);
}

if (editLatInput && editLngInput) {
editLatInput.value = lat.toFixed(6);
editLngInput.value = lng.toFixed(6);
}

if (linkLatInput && linkLngInput) {
linkLatInput.value = lat.toFixed(6);
linkLngInput.value = lng.toFixed(6);
}
}

function updateCrosshairVisibility() {
const crosshairEl = document.getElementById('crosshair');
if (!crosshairEl) return;

if (isMobile && appSettings.crosshairEnabled) {
crosshairEl.style.display = 'block';
} else {
crosshairEl.style.display = 'none';
}
}

function switchBaseLayer(key) {
if (!map || !baseLayers[key]) return;
Object.values(baseLayers).forEach(layer => {
if (map.hasLayer(layer)) map.removeLayer(layer);
});
baseLayers[key].addTo(map);
appSettings.baseLayer = key;
saveSettings({ baseLayer: key });
}

function buildPopupHtml(p) {
const title = escapeHtml(p.name || "Spot senza nome");
const desc = p.desc ? escapeHtml(p.desc).replace(/\n/g, '<br>') : "";
const coords = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
const votoText = p.voto ? `${p.voto}` : "?";
const color = getRatingColor(p.voto || 0);
const emoji = getEmojiByTipo(p.tipo);
const spotId = p.id || '';
const updatedInfo = p.updatedAt ? 
`<br><small>Aggiornato: ${new Date(p.updatedAt).toLocaleDateString('it-IT')}</small>` : '';
const exploratoBadge = p.explorato ? '<span style="background:#f97316; color:#fff; padding:2px 6px; border-radius:999px; font-size:10px; margin-left:4px;">✓ Esplorato</span>' : '';
      
// Icona punto di domanda per spot senza voto
let votoDisplay = '';
if (!p.voto) {
votoDisplay = '<span style="background:#000000; color:#ffffff; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; display:inline-block;">?</span>';
} else {
votoDisplay = `<span style="background:${color}; color:#fff; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; display:inline-block;">${votoText} ★</span>`;
}
      
return `
<div class="ltu-popup">
<div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
<div style="font-size:36px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>
<div style="flex:1;">
<div class="popup-title" style="font-size:15px; font-weight:700; margin-bottom:4px; color:#ffffff !important;">${title} ${exploratoBadge}</div>
${votoDisplay}
</div>
</div>
${desc ? `<div style="font-size:12.5px; line-height:1.45; margin-bottom:12px; color:#e5e7eb;">${desc}</div>` : ''}
<div style="font-size:11px; color:var(--text-dim); margin-bottom:14px;">
${coords}
${p.source === "extra" ? " • LTU extra" : " • Importato"}
${updatedInfo}
</div>
<a href="https://www.google.com/maps?q=${p.lat},${p.lng}"
target="_blank"
rel="noopener"
style="background:#2563eb; color:white; padding:9px 16px; border-radius:999px; text-decoration:none; display:block; text-align:center; font-weight:600; font-size:13px;">
Apri in Google Maps ↗
</a>
<div style="margin-top: 8px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
<button id="list-btn-${spotId}" data-spot-id="${spotId}" style="background: #16a34a; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">📋 Lista</button>
${spotId ? `
<button id="edit-btn-${spotId}" data-spot-id="${spotId}" style="background: #2563eb; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">Modifica</button>
<button id="delete-btn-${spotId}" data-spot-id="${spotId}" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">Elimina</button>
` : ''}
${p.source === "gmaps_missing" ? `<button id="confirm-btn-${spotId}" data-spot-id="${spotId}" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">Conferma spot</button>` : ''}
</div>
</div>
`;
}

function renderMarkers() {
if (!markersLayer) return;
markersLayer.clearLayers();
  
const spotsToRender = filteredSpots.length > 0 ? filteredSpots : allSpots;
let bounds = [];

// Aggiungi anche gli spot mancanti da GMaps
if (gmapsMissingSpots.length > 0) {
spotsToRender.push(...gmapsMissingSpots);
}

// Ottimizzazione: usa batch rendering per molti marker
const batchSize = 50;
const renderBatch = (start) => {
const end = Math.min(start + batchSize, spotsToRender.length);
  
for (let i = start; i < end; i++) {
const p = spotsToRender[i];
let color = getRatingColor(p.voto || 0);
let emoji = getEmojiByTipo(p.tipo);

// Se è uno spot mancante da GMaps
if (p.source === "gmaps_missing") {
// Spot bianco con + nero
const iconHtml = `
<div style="
position: relative;
width: 24px;
height: 24px;
border-radius: 50%;
background: #ffffff;
border: 2px solid #000000;
box-shadow: 0 2px 6px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.1);
display: flex;
align-items: center;
justify-content: center;
font-size: 12px;
color: #000000;
font-weight: bold;
">
+
</div>
`;

const icon = L.divIcon({
html: iconHtml,
className: "ltu-round-marker",
iconSize: [32, 32],
iconAnchor: [16, 16],
popupAnchor: [0, -16]
});

const marker = L.marker([p.lat, p.lng], { 
icon,
riseOnHover: false,
riseOffset: 250
}).addTo(markersLayer);
marker.bindPopup(buildPopupHtml(p));

p._marker = marker;
marker.on("click", () => {
currentSpot = p;
});
bounds.push([p.lat, p.lng]);
continue;
}

// Per spot normali
// Se esplorato, usa colore arancione invece di verde
if (p.explorato) {
color = "#f97316"; // Arancione
}

// Se non ha voto, usa nero con punto di domanda
let iconContent = emoji;
if (!p.voto) {
color = "#000000"; // Nero
iconContent = "?"; // Punto di domanda
}

// CREA PIN ROTONDO
const iconHtml = `
<div style="
position: relative;
width: 24px;
height: 24px;
border-radius: 50%;
background: ${color};
border: 1px solid white;
box-shadow: 0 2px 6px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.1);
display: flex;
align-items: center;
justify-content: center;
font-size: ${!p.voto ? '14px' : '12px'};
color: ${!p.voto ? '#ffffff' : 'white'};
font-weight: ${!p.voto ? 'bold' : 'normal'};
">
${iconContent}
${p.explorato ? '<div style="position:absolute; bottom:-6px; right:-6px; background:#f97316; color:white; width:14px; height:14px; border-radius:50%; border:1px solid white; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:bold;">✓</div>' : ''}
</div>
`;

const icon = L.divIcon({
html: iconHtml,
className: "ltu-round-marker",
iconSize: [32, 32],
iconAnchor: [16, 16],
popupAnchor: [0, -16]
});

const marker = L.marker([p.lat, p.lng], { 
icon,
riseOnHover: false,
riseOffset: 250
}).addTo(markersLayer);
marker.bindPopup(buildPopupHtml(p));

p._marker = marker;
marker.on("click", () => {
currentSpot = p;
});
bounds.push([p.lat, p.lng]);
}
  
// Renderizza il prossimo batch se necessario
if (end < spotsToRender.length) {
setTimeout(() => renderBatch(end), 0);
} else {
// Tutti i marker renderizzati, fai fit bounds se necessario
if (bounds.length > 0 && !lastAddedSpotId) {
const latlngBounds = L.latLngBounds(bounds);
if (latlngBounds.isValid()) {
map.fitBounds(latlngBounds, { padding: [40, 40], maxZoom: 10 });
}
}
}
};
  
// Inizia il rendering batch
renderBatch(0);

// Se c'è uno spot appena aggiunto, centra su di esso
if (lastAddedSpotId) {
const newSpot = spotsToRender.find(s => s.id === lastAddedSpotId);
if (newSpot && newSpot._marker) {
map.setView([newSpot.lat, newSpot.lng], 16);
setTimeout(() => {
if (newSpot._marker) newSpot._marker.openPopup();
}, 300);
lastAddedSpotId = null;
}
}
}

// =========================
// LISTA
// =========================
function renderList() {
const listEl = document.getElementById("listContent");
const searchEl = document.getElementById("listSearch");
const summaryEl = document.getElementById("listSummary");
if (!listEl || !searchEl || !summaryEl) return;
      
const q = (searchEl.value || "").toLowerCase().trim();
const spotsToRender = filteredSpots.length > 0 ? filteredSpots : allSpots;
let filtered = spotsToRender;
      
if (q) {
filtered = spotsToRender.filter(p => {
const txt = (p.name + " " + (p.desc || "")).toLowerCase();
return txt.includes(q);
});
}
      
filtered.sort((a, b) => {
// Prima gli esplorati o meno?
const va = a.voto || 0;
const vb = b.voto || 0;
if (va !== vb) return vb - va;
if (a.updatedAt && b.updatedAt) {
return new Date(b.updatedAt) - new Date(a.updatedAt);
}
return a.name.localeCompare(b.name);
});
      
summaryEl.textContent = `${filtered.length} spot su ${spotsToRender.length} totali (${allSpots.length} totali nel database)`;
listEl.innerHTML = "";
      
filtered.forEach(p => {
const row = document.createElement("li");
row.className = "spot-row";
if (spotToHighlight && p.id === spotToHighlight) {
row.classList.add("highlighted");
}
        
const emojiDiv = document.createElement("div");
emojiDiv.className = "spot-emoji";
emojiDiv.textContent = getEmojiByTipo(p.tipo);
if (p.explorato) {
emojiDiv.style.borderColor = "#f97316"; // Arancione
emojiDiv.style.boxShadow = "0 0 0 1px #f97316";
}
        
const mainDiv = document.createElement("div");
mainDiv.className = "spot-main";
        
const titleRow = document.createElement("div");
titleRow.className = "spot-main-title";
        
const title = document.createElement("strong");
title.textContent = p.name || "(senza nome)";
if (p.explorato) {
title.innerHTML += ' <span style="color:#f97316; font-size:10px;">✓</span>';
}
        
const vote = document.createElement("div");
vote.className = "spot-vote-pill";
vote.textContent = p.voto ? `${p.voto}` : "?";
if (p.explorato) {
vote.style.borderColor = "#f97316";
vote.style.color = "#f97316";
}
        
titleRow.appendChild(title);
titleRow.appendChild(vote);
        
const desc = document.createElement("div");
desc.className = "spot-desc";
desc.textContent = p.desc || "";
        
const meta = document.createElement("div");
meta.className = "spot-meta";
        
const dateInfo = p.updatedAt ? 
new Date(p.updatedAt).toLocaleDateString('it-IT') : 
(p.createdAt ? new Date(p.createdAt).toLocaleDateString('it-IT') : '');
        
meta.innerHTML = `
<span>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span>
<span>${p.source === "extra" ? "LTU" : "Importato"} ${dateInfo ? '• ' + dateInfo : ''}</span>
`;
        
mainDiv.appendChild(titleRow);
mainDiv.appendChild(desc);
mainDiv.appendChild(meta);
        
row.appendChild(emojiDiv);
row.appendChild(mainDiv);
        
row.addEventListener("click", () => {
currentSpot = p;
map.setView([p.lat, p.lng], 16);
if (p._marker) {
p._marker.openPopup();
}
document.getElementById("listPanel").classList.add("hidden");
});
        
listEl.appendChild(row);
});
}

// =========================
// ADD SPOT
// =========================
async function handleAddSubmit(evt) {
evt.preventDefault();
      
if (pendingOperations > 0) {
showToast("Attendi il completamento delle operazioni in corso", "warning");
return;
}
      
const name = document.getElementById("fieldName").value.trim();
const desc = document.getElementById("fieldDesc").value.trim();
const latStr = document.getElementById("fieldLat").value.trim();
const lngStr = document.getElementById("fieldLng").value.trim();
const votoSelect = document.getElementById("fieldVoto");
const votoStr = votoSelect.value;
const tipoSelect = document.getElementById("fieldTipo");
const tipo = tipoSelect.value || getTipo(name, desc);
const explorato = document.getElementById("fieldExplorato").checked;

if (!name || !latStr || !lngStr) {
showToast("Nome, latitudine e longitudine sono obbligatori", "error");
return;
}
      
const lat = parseFloat(latStr.replace(",", "."));
const lng = parseFloat(lngStr.replace(",", "."));
      
if (Number.isNaN(lat) || Number.isNaN(lng)) {
showToast("Coordinate non valide", "error");
return;
}
      
let voto = null;
if (votoStr) {
const v = parseInt(votoStr, 10);
if (v >= 1 && v <= 6) voto = v;
}
      
const payload = { name, desc, lat, lng, voto, tipo, explorato };
      
try {
pendingOperations++;
updateSyncStatus("Salvataggio spot...", "syncing");
        
const result = await fetchWithRetry("/api/spots-extra", {
method: "POST",
headers: { 
"Content-Type": "application/json",
"Authorization": "Basic " + btoa("unit:ltunit")
},
body: JSON.stringify(payload)
});
        
const saved = result.data;
const spot = {
id: saved.id,
name: saved.name || name,
desc: saved.desc || desc,
lat: saved.lat,
lng: saved.lng,
voto: saved.voto != null ? saved.voto : voto,
tipo: saved.tipo || tipo,
explorato: saved.explorato || explorato,
source: "extra",
createdAt: saved.createdAt || new Date().toISOString(),
updatedAt: saved.updatedAt || new Date().toISOString()
};
        
allSpots.push(spot);
lastAddedSpotId = spot.id;
applyFilters(); // Applica filtri anche al nuovo spot
        
document.getElementById("addPanel").classList.add("hidden");
document.getElementById("addForm").reset();
document.getElementById("fieldTipo").value = "";
document.getElementById("fieldVoto").value = "";
document.getElementById("fieldExplorato").checked = false;
        
updateSyncStatus("Spot aggiunto con successo", "success");
showToast("Spot aggiunto!", "success");
        
} catch (e) {
console.error("Errore salvataggio spot:", e);
updateSyncStatus("Errore salvataggio spot", "error");
        
if (e.message.includes("Spot già esistente") || e.message.includes("DUPLICATE_SPOT")) {
showToast("Esiste già uno spot in questa posizione", "error");
} else {
showToast(`Errore nel salvataggio: ${e.message}`, "error");
}
} finally {
pendingOperations--;
}
}

function useCurrentPin() {
if (temporaryPin.lat && temporaryPin.lng) {
updateFormCoordinates(temporaryPin.lat, temporaryPin.lng);
} else {
const center = map.getCenter();
updateFormCoordinates(center.lat, center.lng);
}
}

// =========================
// RANDOM SPOT
// =========================
function pickRandomSpot() {
const spotsToRender = filteredSpots.length > 0 ? filteredSpots : allSpots;
if (!spotsToRender.length) {
showToast("Nessuno spot disponibile", "warning");
return;
}
      
let candidates = spotsToRender;
if (!appSettings.randomIncludeLowRated) {
const filtered = spotsToRender.filter(p => !p.voto || p.voto >= 3);
if (filtered.length) candidates = filtered;
}
      
const idx = Math.floor(Math.random() * candidates.length);
const chosen = candidates[idx];
if (!chosen) return;
      
currentSpot = chosen;
map.setView([chosen.lat, chosen.lng], 16);
if (chosen._marker) {
chosen._marker.openPopup();
}
showToast("Random LTU: " + (chosen.name || "spot"), "info");
}

// =========================
// MISSIONI
// =========================
function openMissionPanel() {
if (!currentSpot) {
showToast("Seleziona prima uno spot dalla mappa", "warning");
return;
}
      
const key = spotKey(currentSpot);
const panel = document.getElementById("missionPanel");
const titleEl = document.getElementById("missionBodyTitle");
const coordsEl = document.getElementById("missionBodyCoords");
const textEl = document.getElementById("missionText");
      
titleEl.textContent = "Spot: " + (currentSpot.name || "(senza nome)");
coordsEl.textContent = `${currentSpot.lat.toFixed(6)}, ${currentSpot.lng.toFixed(6)}`;
textEl.value = missions[key]?.text || "";
panel.classList.remove("hidden");
}

function saveMissionForCurrent() {
if (!currentSpot) return;
      
const key = spotKey(currentSpot);
const text = document.getElementById("missionText").value;
missions[key] = { text };
saveMissions();
showToast("Missione salvata", "success");
document.getElementById("missionPanel").classList.add("hidden");
}

// =========================
// NOTE FUNCTIONS
// =========================
function openNotePanel() {
const panel = document.getElementById("notePanel");
const textEl = document.getElementById("noteText");
      
// Carica le note salvate
textEl.value = notes.general || "";
panel.classList.remove("hidden");
}

function saveNote() {
const text = document.getElementById("noteText").value;
notes.general = text;
saveNotes();
showToast("Note salvate", "success");
document.getElementById("notePanel").classList.add("hidden");
}

// =========================
// IMPORT LINK
// =========================
function openImportLinkPanel() {
document.getElementById("importLinkPanel").classList.remove("hidden");
}

async function decodeGoogleMapsLink() {
const url = document.getElementById("linkInput").value.trim();
if (!url) {
showToast("Incolla un link di Google Maps", "error");
return;
}

try {
updateSyncStatus("Decodifica link...", "syncing");
        
const result = await fetchWithRetry("/api/decode-gmaps-url", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ url })
});
        
const data = result.data;
document.getElementById("coordsFound").textContent = `${data.lat}, ${data.lng}`;
document.getElementById("linkResult").style.display = "block";

// Popola i campi lat/lng automaticamente
updateFormCoordinates(data.lat, data.lng);

// Imposta altri campi vuoti
document.getElementById("linkSpotName").value = "";
document.getElementById("linkSpotDesc").value = "";
document.getElementById("linkSpotVoto").value = "";
document.getElementById("linkSpotTipo").value = "";
document.getElementById("linkSpotExplorato").checked = false;

updateSyncStatus("Coordinate estratte", "success");
showToast("Coordinate estratte con successo!", "success");
        
} catch (error) {
console.error("Errore decodifica:", error);
updateSyncStatus("Errore decodifica link", "error");
showToast("Impossibile decodificare il link. Assicurati che sia un link Google Maps valido.", "error");
}
}

async function addSpotFromLink() {
const name = document.getElementById("linkSpotName").value.trim();
const desc = document.getElementById("linkSpotDesc").value.trim();
const lat = parseFloat(document.getElementById("linkSpotLat").value);
const lng = parseFloat(document.getElementById("linkSpotLng").value);
const votoStr = document.getElementById("linkSpotVoto").value;
const tipo = document.getElementById("linkSpotTipo").value;
const explorato = document.getElementById("linkSpotExplorato").checked;

if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
showToast("Nome e coordinate valide sono obbligatori", "error");
return;
}

let voto = null;
if (votoStr) {
const v = parseInt(votoStr, 10);
if (v >= 1 && v <= 6) voto = v;
}

const tipoFinal = tipo ? String(tipo) : getTipo(name, desc);
const payload = { name, desc, lat, lng, voto, tipo: tipoFinal, explorato };

try {
pendingOperations++;
updateSyncStatus("Aggiunta spot da link...", "syncing");
        
const result = await fetchWithRetry("/api/spots-extra", {
method: "POST",
headers: { 
"Content-Type": "application/json",
"Authorization": "Basic " + btoa("unit:ltunit")
},
body: JSON.stringify(payload)
});
        
const saved = result.data;
const spot = {
id: saved.id,
name: saved.name || name,
desc: saved.desc || desc,
lat: saved.lat,
lng: saved.lng,
voto: saved.voto,
tipo: saved.tipo || tipoFinal,
explorato: saved.explorato || explorato,
source: "extra",
createdAt: saved.createdAt || new Date().toISOString(),
updatedAt: saved.updatedAt || new Date().toISOString()
};

allSpots.push(spot);
lastAddedSpotId = spot.id;
applyFilters(); // Applica filtri anche al nuovo spot
        
document.getElementById("importLinkPanel").classList.add("hidden");
document.getElementById("linkInput").value = "";
document.getElementById("linkResult").style.display = "none";
        
updateSyncStatus("Spot aggiunto dal link", "success");
showToast("Spot aggiunto dal link!", "success");
        
} catch (e) {
console.error(e);
updateSyncStatus("Errore aggiunta spot", "error");
showToast(`Errore nel salvataggio dello spot: ${e.message}`, "error");
} finally {
pendingOperations--;
}
}

// =========================
// GOOGLE MAPS ALIGNMENT
// =========================
function parseGoogleMapsCSV(csvText) {
const rows = parseCSV(csvText);
if (rows.length === 0) return [];
  
const headers = rows[0].map(h => h.toLowerCase());
const dataRows = rows.slice(1);
  
// Cerca le colonne necessarie
const latIndex = headers.findIndex(h => h.includes('latitudine') || h.includes('latitude') || h === 'lat');
const lngIndex = headers.findIndex(h => h.includes('longitudine') || h.includes('longitude') || h === 'lng' || h === 'lon');
const nameIndex = headers.findIndex(h => h.includes('nome') || h.includes('name') || h.includes('titolo') || h === 'title');
  
if (latIndex === -1 || lngIndex === -1) {
throw new Error("Formato CSV non valido: colonne latitudine/longitudine non trovate");
}
  
const gmapsSpots = [];
  
for (let i = 0; i < dataRows.length; i++) {
const row = dataRows[i];
if (row.length <= Math.max(latIndex, lngIndex)) continue;
  
const lat = parseFloat(row[latIndex]);
const lng = parseFloat(row[lngIndex]);
  
if (isNaN(lat) || isNaN(lng)) continue;
  
const name = nameIndex !== -1 && row[nameIndex] ? row[nameIndex].trim() : `Spot GMaps ${i + 1}`;
  
gmapsSpots.push({
name: name,
lat: lat,
lng: lng,
desc: "Importato da Google Maps Takeout",
source: "gmaps_import",
voto: null,
tipo: "altro",
explorato: false
});
}
  
return gmapsSpots;
}

async function alignGoogleMapsData(csvFile) {
try {
updateSyncStatus("Analisi file Google Maps...", "syncing");
const fileText = await readFileAsText(csvFile);
const gmapsSpots = parseGoogleMapsCSV(fileText);
  
if (gmapsSpots.length === 0) {
showToast("Nessuno spot valido trovato nel file CSV", "warning");
return;
}
  
// Trova spot mancanti
const missingSpots = [];
const existingCoords = allSpots.map(s => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`);
  
for (const gspot of gmapsSpots) {
const coordKey = `${gspot.lat.toFixed(6)},${gspot.lng.toFixed(6)}`;
if (!existingCoords.includes(coordKey)) {
// Aggiungi ID temporaneo
gspot.id = `gmaps_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
gspot.source = "gmaps_missing";
missingSpots.push(gspot);
}
}
  
if (missingSpots.length === 0) {
showToast("Tutti gli spot di Google Maps sono già nel database", "success");
return;
}
  
// Salva gli spot mancanti
gmapsMissingSpots = missingSpots;
  
// Mostra i risultati
const statusEl = document.getElementById('gmapsAlignmentStatus');
const spotsListEl = document.getElementById('gmapsSpotsList');
const missingContainer = document.getElementById('gmapsMissingSpots');
  
statusEl.textContent = `Trovati ${gmapsSpots.length} spot in Google Maps, ${missingSpots.length} mancanti nel database`;
statusEl.style.display = 'block';
  
spotsListEl.innerHTML = '';
missingSpots.forEach((spot, index) => {
const spotEl = document.createElement('div');
spotEl.style.padding = '6px';
spotEl.style.borderBottom = '1px solid rgba(55, 65, 81, 0.5)';
spotEl.style.fontSize = '11px';
spotEl.innerHTML = `
<div style="display: flex; align-items: center; gap: 8px;">
<input type="checkbox" id="gmaps_spot_${index}" checked style="width: 14px; height: 14px;">
<label for="gmaps_spot_${index}" style="flex: 1; cursor: pointer;">
<strong>${spot.name}</strong><br>
<small>${spot.lat.toFixed(6)}, ${spot.lng.toFixed(6)}</small>
</label>
</div>
`;
spotsListEl.appendChild(spotEl);
});
  
missingContainer.style.display = 'block';
  
// Rimuovi eventuali marker precedenti e renderizza quelli nuovi
renderMarkers();
  
updateSyncStatus(`${missingSpots.length} spot mancanti trovati`, "success");
showToast(`Trovati ${missingSpots.length} spot mancanti da Google Maps`, "success");
  
} catch (error) {
console.error("Errore allineamento Google Maps:", error);
updateSyncStatus("Errore allineamento", "error");
showToast(`Errore nell'analisi del file CSV: ${error.message}`, "error");
}
}

function readFileAsText(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = (e) => resolve(e.target.result);
reader.onerror = (e) => reject(new Error("Errore nella lettura del file"));
reader.readAsText(file, 'UTF-8');
});
}

async function importMissingSpots() {
const checkboxes = document.querySelectorAll('#gmapsSpotsList input[type="checkbox"]:checked');
if (checkboxes.length === 0) {
showToast("Seleziona almeno uno spot da importare", "warning");
return;
}
  
const spotsToImport = [];
checkboxes.forEach((cb, index) => {
if (cb.checked) {
const spot = gmapsMissingSpots[index];
if (spot) {
spotsToImport.push(spot);
}
}
});
  
if (spotsToImport.length === 0) {
showToast("Nessuno spot selezionato", "warning");
return;
}
  
try {
pendingOperations++;
updateSyncStatus(`Importazione ${spotsToImport.length} spot...`, "syncing");
  
let importedCount = 0;
let errors = [];
  
for (const spot of spotsToImport) {
try {
const payload = {
name: spot.name,
desc: spot.desc,
lat: spot.lat,
lng: spot.lng,
voto: spot.voto,
tipo: spot.tipo,
explorato: spot.explorato
};
  
const result = await fetchWithRetry("/api/spots-extra", {
method: "POST",
headers: { 
"Content-Type": "application/json",
"Authorization": "Basic " + btoa("unit:ltunit")
},
body: JSON.stringify(payload)
});
  
const saved = result.data;
const newSpot = {
id: saved.id,
name: saved.name || spot.name,
desc: saved.desc || spot.desc,
lat: saved.lat,
lng: saved.lng,
voto: saved.voto,
tipo: saved.tipo || spot.tipo,
explorato: saved.explorato || spot.explorato,
source: "extra",
createdAt: saved.createdAt || new Date().toISOString(),
updatedAt: saved.updatedAt || new Date().toISOString()
};
  
allSpots.push(newSpot);
importedCount++;
  
// Rimuovi dall'array dei mancanti
const index = gmapsMissingSpots.findIndex(s => s.id === spot.id);
if (index !== -1) {
gmapsMissingSpots.splice(index, 1);
}
  
} catch (error) {
errors.push(`"${spot.name}": ${error.message}`);
}
}
  
// Aggiorna la vista
applyFilters();
  
// Nascondi il pannello dei mancanti
document.getElementById('gmapsMissingSpots').style.display = 'none';
document.getElementById('gmapsAlignmentStatus').textContent = `Importati ${importedCount} spot su ${spotsToImport.length}`;
  
updateSyncStatus(`${importedCount} spot importati`, "success");
  
if (errors.length > 0) {
showToast(`Importati ${importedCount} spot, errori: ${errors.length}`, "warning");
} else {
showToast(`${importedCount} spot importati con successo`, "success");
}
  
} catch (error) {
console.error("Errore importazione spot mancanti:", error);
updateSyncStatus("Errore importazione", "error");
showToast(`Errore nell'importazione: ${error.message}`, "error");
} finally {
pendingOperations--;
}
}

// =========================
// SETTINGS: IMPORT / EXPORT
// =========================
async function handleImportJson() {
const raw = document.getElementById("importTextarea").value.trim();
if (!raw) {
showToast("Incolla prima il JSON", "error");
return;
}
      
let obj;
try {
obj = JSON.parse(raw);
} catch (e) {
showToast("JSON non valido", "error");
return;
}
      
let arr = [];
if (Array.isArray(obj)) {
arr = obj;
} else if (Array.isArray(obj.places)) {
arr = obj.places;
} else {
showToast("Formato JSON non riconosciuto", "error");
return;
}
      
const confirmed = await showConfirm(
"Importazione JSON",
`Sei sicuro di voler importare ${arr.length} spot?`
);
      
if (!confirmed) return;
      
let importedCount = 0;
let errors = [];
      
try {
pendingOperations++;
updateSyncStatus(`Importazione ${arr.length} spot...`, "syncing");
        
for (let i = 0; i < arr.length; i++) {
const place = arr[i];
const name = place.name || place.title || "";
const desc = place.desc || place.description || "";
const lat = parseFloat(place.lat ?? place.latitude);
const lng = parseFloat(place.lng ?? place.longitude);
const explorato = place.explorato || false;
          
if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
errors.push(`Spot ${i + 1}: Dati mancanti o invalidi`);
continue;
}
          
const voto = place.voto != null ? parseInt(place.voto, 10) : extractVoto(desc);
const tipo = place.tipo || getTipo(name, desc);
const payload = { name, desc, lat, lng, voto, tipo, explorato };
          
try {
const result = await fetchWithRetry("/api/spots-extra", {
method: "POST",
headers: { 
"Content-Type": "application/json",
"Authorization": "Basic " + btoa("unit:ltunit")
},
body: JSON.stringify(payload)
});
            
if (result.success) {
const saved = result.data;
const spot = {
id: saved.id,
name: saved.name || name,
desc: saved.desc || desc,
lat: saved.lat,
lng: saved.lng,
voto: saved.voto != null ? saved.voto : voto,
tipo: saved.tipo || tipo,
explorato: saved.explorato || explorato,
source: "extra",
createdAt: saved.createdAt || new Date().toISOString(),
updatedAt: saved.updatedAt || new Date().toISOString()
};
allSpots.push(spot);
importedCount++;
}
} catch (e) {
errors.push(`Spot ${i + 1}: ${e.message}`);
}
}
        
if (importedCount > 0) {
applyFilters(); // Applica filtri a tutti gli spot
}
        
updateSyncStatus(`Importati ${importedCount} spot`, "success");
        
let message = `Importati ${importedCount} spot su ${arr.length}`;
if (errors.length > 0) {
message += `\nErrori: ${errors.length}`;
if (errors.length <= 5) {
message += `\n${errors.join('\n')}`;
}
}
        
showToast(message, importedCount > 0 ? "success" : "warning");
        
} catch (error) {
console.error("Errore importazione:", error);
updateSyncStatus("Errore importazione", "error");
showToast(`Errore durante l'importazione: ${error.message}`, "error");
} finally {
pendingOperations--;
}
}

function handleExportCsv() {
const spotsToExport = filteredSpots.length > 0 ? filteredSpots : allSpots;
if (!spotsToExport.length) {
showToast("Nessuno spot da esportare", "warning");
return;
}
let csv = "Name,Description,Latitude,Longitude,Voto,Tipo,Explorato,CreatedAt,UpdatedAt,Source\n";
spotsToExport.forEach(p => {
const name = (p.name || "").replace(/"/g, '""');
const desc = (p.desc || "").replace(/"/g, '""');
const voto = p.voto || "";
const tipo = p.tipo || "";
const explorato = p.explorato ? "true" : "false";
const createdAt = p.createdAt || "";
const updatedAt = p.updatedAt || "";
const source = p.source || "";
csv += `"${name}","${desc}",${p.lat},${p.lng},${voto},${tipo},${explorato},${createdAt},${updatedAt},${source}\n`;
});
      
document.getElementById("exportTextarea").value = csv;
showToast(`CSV generato: ${spotsToExport.length} spot`, "success");
}

// =========================
// CERCA CITTA'
// =========================
function searchCity() {
const query = document.getElementById('citySearchInput').value.trim();
if (!query) {
showToast("Inserisci una città da cercare", "warning");
return;
}

const resultsContainer = document.getElementById('citySearchResults');
resultsContainer.innerHTML = '<div class="city-result-item">Ricerca in corso...</div>';
resultsContainer.style.display = 'block';

// Usa Nominatim di OpenStreetMap
const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=it`;

fetch(url)
.then(response => response.json())
.then(data => {
if (data.length === 0) {
resultsContainer.innerHTML = '<div class="city-result-item">Nessun risultato trovato</div>';
return;
}

resultsContainer.innerHTML = '';
data.forEach(place => {
const item = document.createElement('div');
item.className = 'city-result-item';
item.innerHTML = `<strong>${place.display_name}</strong><br><small>${place.lat}, ${place.lon}</small>`;
item.addEventListener('click', () => {
map.setView([parseFloat(place.lat), parseFloat(place.lon)], 13);
resultsContainer.style.display = 'none';
document.getElementById('citySearchInput').value = place.display_name.split(',')[0];
showToast(`Centrato su ${place.display_name.split(',')[0]}`, "success");
});
resultsContainer.appendChild(item);
});
})
.catch(error => {
console.error('Errore ricerca città:', error);
resultsContainer.innerHTML = '<div class="city-result-item">Errore nella ricerca</div>';
});
}

function initCitySearch() {
const searchBtn = document.getElementById('citySearchBtn');
const searchInput = document.getElementById('citySearchInput');
const resultsContainer = document.getElementById('citySearchResults');

searchBtn.addEventListener('click', searchCity);

searchInput.addEventListener('keypress', (e) => {
if (e.key === 'Enter') {
searchCity();
}
});

// Chiudi risultati quando si clicca fuori
document.addEventListener('click', (e) => {
if (!e.target.closest('#citySearchContainer')) {
resultsContainer.style.display = 'none';
}
});
}

// =========================
// POSIZIONE UTENTE
// =========================
function toggleUserLocation() {
if (!isUserLocationActive) {
startUserLocation();
} else {
stopUserLocation();
}
}

function startUserLocation() {
if (!navigator.geolocation) {
showToast("Geolocalizzazione non supportata dal browser", "error");
return;
}

// Se già abbiamo il permesso, avvia direttamente
if (hasLocationPermission) {
startLocationWatch();
return;
}

const btn = document.getElementById('userLocationBtn');
btn.classList.add('active');
btn.title = "Disattiva posizione";

// Richiedi il permesso una sola volta
const options = {
enableHighAccuracy: true,
timeout: 10000,
maximumAge: 0
};

navigator.geolocation.getCurrentPosition(
(position) => {
// Permesso concesso
hasLocationPermission = true;
isFirstLocationUpdate = true;
startLocationWatch();
showToast("Posizione attivata", "success");
},
(error) => {
handleUserLocationError(error);
btn.classList.remove('active');
},
options
);
}

function startLocationWatch() {
if (userLocationWatchId) {
// Già in ascolto
return;
}

const options = {
enableHighAccuracy: true,
timeout: 10000,
maximumAge: 0
};

userLocationWatchId = navigator.geolocation.watchPosition(
(position) => {
const lat = position.coords.latitude;
const lng = position.coords.longitude;
const accuracy = position.coords.accuracy;
handleUserLocationSuccess(lat, lng, accuracy);
},
handleUserLocationError,
options
);

isUserLocationActive = true;
}

function stopUserLocation() {
if (userLocationWatchId) {
navigator.geolocation.clearWatch(userLocationWatchId);
userLocationWatchId = null;
}

if (userLocationMarker) {
map.removeLayer(userLocationMarker);
userLocationMarker = null;
}

if (userLocationCircle) {
map.removeLayer(userLocationCircle);
userLocationCircle = null;
}

const btn = document.getElementById('userLocationBtn');
btn.classList.remove('active');
btn.title = "Posizione attuale";

isUserLocationActive = false;
}

function handleUserLocationSuccess(lat, lng, accuracy) {
// Rimuovi marcatori precedenti
if (userLocationMarker) {
map.removeLayer(userLocationMarker);
}
if (userLocationCircle) {
map.removeLayer(userLocationCircle);
}

// Crea marker posizione utente
userLocationMarker = L.marker([lat, lng], {
icon: L.divIcon({
className: 'user-location-marker',
iconSize: [20, 20],
iconAnchor: [10, 10]
})
}).addTo(map);

// Crea cerchio di accuratezza
userLocationCircle = L.circle([lat, lng], {
radius: accuracy,
className: 'user-location-accuracy',
fillOpacity: 0.2,
weight: 1,
color: '#10b981'
}).addTo(map);

// Centra la mappa solo la prima volta
if (isFirstLocationUpdate) {
map.setView([lat, lng], 16);
isFirstLocationUpdate = false;
}
}

function handleUserLocationError(error) {
let message = "Errore geolocalizzazione: ";
switch(error.code) {
case error.PERMISSION_DENIED:
message += "Permesso negato. Abilita la geolocalizzazione nelle impostazioni del browser.";
hasLocationPermission = false;
break;
case error.POSITION_UNAVAILABLE:
message += "Posizione non disponibile";
break;
case error.TIMEOUT:
message += "Timeout nella richiesta";
break;
default:
message += "Errore sconosciuto";
break;
}

showToast(message, "error");
stopUserLocation();
}

// =========================
// UI INIT
// =========================
function initUI() {
// FILTRI
initFilters();

// LISTA
const btnList = document.getElementById("btnList");
const btnCloseList = document.getElementById("btnCloseList");
const listPanel = document.getElementById("listPanel");
const listSearch = document.getElementById("listSearch");
      
btnList.addEventListener("click", () => {
const hidden = listPanel.classList.contains("hidden");
if (hidden) {
spotToHighlight = null;
renderList();
listPanel.classList.remove("hidden");
} else {
listPanel.classList.add("hidden");
}
});
      
btnCloseList.addEventListener("click", () => {
listPanel.classList.add("hidden");
spotToHighlight = null;
});
      
listSearch.addEventListener("input", () => {
renderList();
});

// ADD
const btnAdd = document.getElementById("btnAdd");
const btnCloseAdd = document.getElementById("btnCloseAdd");
const addPanel = document.getElementById("addPanel");
const addForm = document.getElementById("addForm");
const btnUseCurrentPin = document.getElementById("btnUseCurrentPin");
      
btnAdd.addEventListener("click", () => {
addPanel.classList.remove("hidden");
useCurrentPin();
});
      
btnCloseAdd.addEventListener("click", () => {
addPanel.classList.add("hidden");
});
      
addForm.addEventListener("submit", handleAddSubmit);
btnUseCurrentPin.addEventListener("click", (e) => {
e.preventDefault();
useCurrentPin();
});

// SETTINGS
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const mapStyleSelect = document.getElementById("mapStyleSelect");
const randomLowRatedCheckbox = document.getElementById("randomLowRatedCheckbox");
const btnImportJson = document.getElementById("btnImportJson");
const btnExportCsv = document.getElementById("btnExportCsv");
const btnSaveAllSettings = document.getElementById("btnSaveAllSettings");
const btnAlignGmaps = document.getElementById("btnAlignGmaps");
const gmapsCsvFile = document.getElementById("gmapsCsvFile");
const btnImportMissingSpots = document.getElementById("btnImportMissingSpots");

settingsBtn.addEventListener("click", () => {
// sync UI con settings correnti
mapStyleSelect.value = appSettings.baseLayer || "osm";
randomLowRatedCheckbox.checked = !!appSettings.randomIncludeLowRated;
settingsPanel.classList.remove("hidden");
settingsBtn.classList.add("active");
});

btnCloseSettings.addEventListener("click", () => {
settingsPanel.classList.add("hidden");
settingsBtn.classList.remove("active");
});

mapStyleSelect.addEventListener("change", (e) => {
const val = e.target.value;
switchBaseLayer(val);
showToast("Stile mappa aggiornato", "success");
});

randomLowRatedCheckbox.addEventListener("change", (e) => {
const checked = e.target.checked;
appSettings.randomIncludeLowRated = checked;
showToast("Impostazione random aggiornata", "success");
});

btnImportJson.addEventListener("click", handleImportJson);
btnExportCsv.addEventListener("click", handleExportCsv);

// Google Maps alignment
gmapsCsvFile.addEventListener("change", (e) => {
const file = e.target.files[0];
if (file) {
alignGoogleMapsData(file);
}
});

btnImportMissingSpots.addEventListener("click", importMissingSpots);

btnSaveAllSettings.addEventListener("click", () => {
saveSettings({
baseLayer: mapStyleSelect.value,
randomIncludeLowRated: randomLowRatedCheckbox.checked
});
saveLocalSettings();
showToast("Tutte le impostazioni salvate!", "success");
// Chiudi il pannello settings dopo il salvataggio
document.getElementById("settingsPanel").classList.add("hidden");
settingsBtn.classList.remove("active");
});

// RANDOM
const btnRandom = document.getElementById("btnRandom");
btnRandom.addEventListener("click", pickRandomSpot);

// MISSIONI
const missionBtn = document.getElementById("missionBtn");
const missionPanel = document.getElementById("missionPanel");
const btnCloseMission = document.getElementById("btnCloseMission");
const btnSaveMission = document.getElementById("btnSaveMission");
      
missionBtn.addEventListener("click", openMissionPanel);
btnCloseMission.addEventListener("click", () => {
missionPanel.classList.add("hidden");
});
btnSaveMission.addEventListener("click", saveMissionForCurrent);

// NOTE - NUOVO
const noteBtn = document.getElementById("noteBtn");
const notePanel = document.getElementById("notePanel");
const btnCloseNote = document.getElementById("btnCloseNote");
const btnSaveNote = document.getElementById("btnSaveNote");
      
noteBtn.addEventListener("click", openNotePanel);
btnCloseNote.addEventListener("click", () => {
notePanel.classList.add("hidden");
});
btnSaveNote.addEventListener("click", saveNote);

// IMPORT LINK
const importLinkBtn = document.getElementById("importLinkBtn");
const importLinkPanel = document.getElementById("importLinkPanel");
const btnCloseImportLink = document.getElementById("btnCloseImportLink");
const btnDecodeLink = document.getElementById("btnDecodeLink");
const btnAddFromLink = document.getElementById("btnAddFromLink");
      
importLinkBtn.addEventListener("click", openImportLinkPanel);
btnCloseImportLink.addEventListener("click", () => {
importLinkPanel.classList.add("hidden");
document.getElementById("linkInput").value = "";
document.getElementById("linkResult").style.display = "none";
});
btnDecodeLink.addEventListener("click", decodeGoogleMapsLink);
btnAddFromLink.addEventListener("click", addSpotFromLink);

// DOCK TOGGLE
const dockToggleBtn = document.getElementById("dockToggleBtn");
const rightDock = document.getElementById("rightDock");
      
dockToggleBtn.addEventListener("click", () => {
rightDock.classList.toggle("collapsed");
const isCollapsed = rightDock.classList.contains("collapsed");
dockToggleBtn.innerHTML = isCollapsed ? "⬇️" : "⬆️";
dockToggleBtn.title = isCollapsed ? "Espandi pulsanti" : "Comprimi pulsanti";
});

// POSIZIONE UTENTE
const userLocationBtn = document.getElementById("userLocationBtn");
userLocationBtn.addEventListener("click", toggleUserLocation);

// CERCA CITTA'
initCitySearch();

// EVENTI PER POPUP DINAMICI
document.addEventListener('click', async (e) => {
if (e.target.id && e.target.id.startsWith('list-btn-')) {
e.preventDefault();
const spotId = e.target.dataset.spotId;
const spot = allSpots.find(s => s.id === spotId) || gmapsMissingSpots.find(s => s.id === spotId);
if (!spot) {
showToast('Spot non trovato', 'error');
return;
}

// Apri il pannello lista evidenziando lo spot
spotToHighlight = spotId;
renderList();
document.getElementById("listPanel").classList.remove("hidden");
map.closePopup();
}

if (e.target.id && e.target.id.startsWith('delete-btn-')) {
e.preventDefault();
const spotId = e.target.dataset.spotId;
if (!spotId) {
showToast('Spot non modificabile', 'error');
return;
}
          
const spot = allSpots.find(s => s.id === spotId);
if (!spot) {
showToast('Spot non trovato', 'error');
return;
}
          
const confirmed = await showConfirm(
'Eliminazione spot',
`Sei sicuro di eliminare "${spot.name}"?\nQuesta azione non può essere annullata.`
);
          
if (!confirmed) return;
          
try {
pendingOperations++;
updateSyncStatus("Eliminazione spot...", "syncing");
            
const result = await fetchWithRetry(`/api/spots-extra/${spotId}`, { 
method: 'DELETE',
headers: {
"Authorization": "Basic " + btoa("unit:ltunit")
}
});
           
// Rimuovi dall'array e aggiorna
allSpots = allSpots.filter(s => s.id !== spotId);
applyFilters(); // Aggiorna filtri dopo eliminazione
map.closePopup();
            
updateSyncStatus("Spot eliminato", "success");
showToast('Spot eliminato', 'success');
            
} catch (err) {
console.error(err);
updateSyncStatus("Errore eliminazione", "error");
showToast(`Errore eliminazione: ${err.message}`, 'error');
} finally {
pendingOperations--;
}
}

if (e.target.id && e.target.id.startsWith('edit-btn-')) {
e.preventDefault();
const spotId = e.target.dataset.spotId;
const spot = allSpots.find(s => s.id === spotId);
if (!spot) {
showToast('Spot non trovato', 'error');
return;
}
          
// Apri pannello edit con dati precompilati
document.getElementById('editSpotId').value = spotId;
document.getElementById('editFieldName').value = spot.name || '';
document.getElementById('editFieldDesc').value = spot.desc || '';
document.getElementById('editFieldVoto').value = spot.voto || '';
document.getElementById('editFieldLat').value = spot.lat.toFixed(6);
document.getElementById('editFieldLng').value = spot.lng.toFixed(6);
document.getElementById('editFieldTipo').value = spot.tipo || '';
document.getElementById('editFieldExplorato').checked = spot.explorato || false;

document.getElementById('editPanel').classList.remove('hidden');
currentSpot = spot;
map.closePopup();
}

// Conferma spot da GMaps
if (e.target.id && e.target.id.startsWith('confirm-btn-')) {
e.preventDefault();
const spotId = e.target.dataset.spotId;
const spot = gmapsMissingSpots.find(s => s.id === spotId);
if (!spot) {
showToast('Spot non trovato', 'error');
return;
}
          
// Apri pannello add con dati precompilati
document.getElementById('fieldName').value = spot.name || '';
document.getElementById('fieldDesc').value = spot.desc || '';
document.getElementById('fieldLat').value = spot.lat.toFixed(6);
document.getElementById('fieldLng').value = spot.lng.toFixed(6);
document.getElementById('fieldVoto').value = '';
document.getElementById('fieldTipo').value = spot.tipo || '';
document.getElementById('fieldExplorato').checked = spot.explorato || false;

document.getElementById('addPanel').classList.remove('hidden');
currentSpot = spot;
map.closePopup();
}
});

// SUBMIT EDIT FORM
const editForm = document.getElementById('editForm');
const btnCloseEdit = document.getElementById('btnCloseEdit');
const editPanel = document.getElementById('editPanel');
const btnUseCurrentPinEdit = document.getElementById('btnUseCurrentPinEdit');
      
editForm.addEventListener('submit', async (evt) => {
evt.preventDefault();
        
if (pendingOperations > 0) {
showToast("Attendi il completamento delle operazioni in corso", "warning");
return;
}
        
const spotId = document.getElementById('editSpotId').value;
const name = document.getElementById('editFieldName').value.trim();
const desc = document.getElementById('editFieldDesc').value.trim();
const latStr = document.getElementById('editFieldLat').value.trim();
const lngStr = document.getElementById('editFieldLng').value.trim();
const votoSelect = document.getElementById('editFieldVoto');
const votoStr = votoSelect.value;
const tipoSelect = document.getElementById('editFieldTipo');
const tipo = tipoSelect.value || getTipo(name, desc);
const explorato = document.getElementById('editFieldExplorato').checked;

if (!name || !latStr || !lngStr) {
showToast('Nome, latitudine e longitudine sono obbligatori', 'error');
return;
}
        
const lat = parseFloat(latStr.replace(',', '.'));
const lng = parseFloat(lngStr.replace(',', '.'));
        
if (Number.isNaN(lat) || Number.isNaN(lng)) {
showToast('Coordinate non valide', 'error');
return;
}
        
let voto = null;
if (votoStr) {
const v = parseInt(votoStr, 10);
if (v >= 1 && v <= 6) voto = v;
}
        
const payload = { name, desc, lat, lng, voto, tipo, explorato };
        
try {
pendingOperations++;
updateSyncStatus("Aggiornamento spot...", "syncing");
          
const result = await fetchWithRetry(`/api/spots-extra/${spotId}`, {
method: 'PUT',
headers: { 
'Content-Type': 'application/json',
"Authorization": "Basic " + btoa("unit:ltunit")
},
body: JSON.stringify(payload)
});
          
const updatedSpot = result.data;
const index = allSpots.findIndex(s => s.id === spotId);
          
if (index !== -1) {
allSpots[index] = { 
...allSpots[index],
...updatedSpot,
source: 'extra',
updatedAt: updatedSpot.updatedAt || new Date().toISOString()
};
}
          
// Aggiorna i filtri mantenendo la vista corrente
applyFilters();
editPanel.classList.add('hidden');
editForm.reset();
          
updateSyncStatus("Spot aggiornato", "success");
showToast('Spot modificato', 'success');
          
} catch (err) {
console.error(err);
updateSyncStatus("Errore aggiornamento", "error");
          
if (err.message.includes("Esiste già un altro spot")) {
showToast("Esiste già un altro spot in questa posizione", "error");
} else {
showToast(`Errore nel salvataggio delle modifiche: ${err.message}`, 'error');
}
} finally {
pendingOperations--;
}
});
      
btnCloseEdit.addEventListener('click', () => {
editPanel.classList.add('hidden');
});
      
btnUseCurrentPinEdit.addEventListener('click', (e) => {
e.preventDefault();
useCurrentPin();
});

// Nascondi pin temporaneo quando si apre un overlay
document.querySelectorAll('.overlay').forEach(overlay => {
overlay.addEventListener('click', (e) => {
if (e.target.classList.contains('overlay-backdrop')) {
removeTemporaryPin();
}
});
});
      
// Auto-refresh ogni 30 secondi se ci sono operazioni pendenti
setInterval(() => {
if (pendingOperations > 0) {
console.log("Auto-refresh per operazioni pendenti");
reloadAllSpots(true);
}
}, 30000);
}

// =========================
// BOOT
// =========================
document.addEventListener("DOMContentLoaded", async () => {
try {
loadMissions();
loadNotes(); // Carica le note
await loadSettings();
initMap();
initUI();
await reloadAllSpots();
        
// Mostra notifica di caricamento completato
setTimeout(() => {
showToast("LTU Mappa caricata ✓", "success");
}, 1000);
        
} catch (error) {
console.error("Errore inizializzazione:", error);
showToast("Errore inizializzazione applicazione", "error");
}
});
    
// Gestione offline/online
window.addEventListener('online', () => {
showToast("Connessione ripristinata", "success");
reloadAllSpots(true);
});
    
window.addEventListener('offline', () => {
showToast("Connessione persa - modalità offline", "warning");
});
</script>
</body>
</html>
