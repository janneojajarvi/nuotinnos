 

let selectedDuration = "1";
let selectedAccidental = ""; 
let isDottedMode = false;
let synthControl;
let currentAbc;
let visualObj; // Globaali muuttuja temposäädintä varten


let currentWarp = 1.0;

 function changeTempo(newBpm) {
    const bpm = parseInt(newBpm);
    
    // Päivitetään tekstinäyttö
    if (document.getElementById('tempoDisplay')) {
        document.getElementById('tempoDisplay').innerText = bpm;
    }

    // Käytetään ABCJS:n sisäänrakennettua warp-metodia!
    // Koska biisi on aina pohjimmiltaan Q:100, setWarp(120) tarkoittaa suoraan 120 BPM.
    if (synthControl) {
        synthControl.setWarp(bpm);
    }
}

// --- APUFUNKTIOT ---

function getPitchValue(acc, note, oct) {
    const basePitches = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    let p = basePitches[note.toUpperCase()];
    if (note === note.toLowerCase()) p += 12;
    if (oct) {
        for (let char of oct) {
            if (char === ',') p -= 12;
            if (char === "'") p += 12;
        }
    }
    if (acc === '^') p += 1;
    if (acc === '_') p -= 1;
    return p;
}

function playSingleNote(noteAbc) {
    if (!ABCJS.synth.supportsAudio()) return;

    // Luodaan lyhyt ABC-pätkä yhdelle nuotille
    // Käytetään oletusasetuksia nopeaan toistoon
    const singleNoteVisual = ABCJS.renderAbc("hidden-paper", "L:1/4\n" + noteAbc, { style: "display:none" })[0];
    
    const midiContext = new (window.AudioContext || window.webkitAudioContext)();
    const synth = new ABCJS.synth.CreateSynth();

    synth.init({
        visualObj: singleNoteVisual,
        audioContext: midiContext
    }).then(() => {
        return synth.prime();
    }).then(() => {
        synth.start();
        // Pysäytetään ja suljetaan context lyhyen ajan kuluttua (esim. 500ms)
        setTimeout(() => {
            synth.stop();
            if (midiContext.state !== 'closed') midiContext.close();
        }, 500);
    }).catch(err => console.warn("Nuotin soitto epäonnistui:", err));
}




function toggleManualEdit() {
    const textarea = document.getElementById('searchQuery');
    const btn = document.getElementById('manual-edit-btn');
    
    if (textarea.readOnly) {
        // Sallitaan vapaa kirjoitus
        textarea.readOnly = false;
        textarea.setAttribute('inputmode', 'text');
        textarea.style.backgroundColor = "#fffde7"; // Kellertävä tausta muokkaustilassa
        textarea.focus();
        btn.innerText = "✅";
    } else {
        // Palataan takaisin nappulasyöttöön
        textarea.readOnly = true;
        textarea.setAttribute('inputmode', 'none');
        textarea.style.backgroundColor = "white";
        btn.innerText = "✏️";
    }
}

// --- LATAUS JA HAKU ---

function initPlayer() {

    if (!ABCJS.synth.supportsAudio()) return;

    // Tuodaan soitin näkyviin
    const audioContainer = document.getElementById("audio-controls");
    if (audioContainer) {
        audioContainer.style.display = "block";
        audioContainer.innerHTML = "";
    }

    // Luodaan AudioContext vain kerran
    if (!window.myAudioContext) {
        window.myAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Pysäytetään mahdollinen vanha soitto
    if (synthControl) {
        synthControl.pause();
    }

    const synth = new ABCJS.synth.CreateSynth();

    synth.init({
        visualObj: visualObj,
        audioContext: window.myAudioContext
    })
    .then(() => {
        if (!synthControl) {
            synthControl = new ABCJS.synth.SynthController();
        }

        synthControl.load("#audio-controls", null, {
            displayRestart: true,
            displayPlay: true,
            displayProgress: true,
            displayWarp: true
        });

        return synthControl.setTune(visualObj, false);
    })
    .then(() => {
        const bpm = parseInt(document.getElementById("tempoRange").value) || 100;
        synthControl.setWarp(bpm);
    })
    .catch(err => {
        console.warn("Audioalustus epäonnistui:", err);
    });
}


function processAbc() {

    const editor = document.getElementById("searchQuery");

    currentAbc = editor.value;

    // Siivotaan vanhat Q: ja L: määritykset pois, jotta ne eivät mene päällekkäin
    const cleanAbc = currentAbc.replace(/^[QL]:.*$/gm, "").trim();
    
    // Määritellään peruskestoksi L:1/4
    const abcWithTempo = "L:1/4\nQ:100\n" + cleanAbc;

    visualObj = ABCJS.renderAbc("paper", abcWithTempo, {
        responsive: "resize",
        paddingbottom: 35
    })[0];

    initPlayer();
}

// --- TAPAHTUMAT ---



document.addEventListener('DOMContentLoaded', () => {
   processAbc();  
    
    const abcEditor = document.getElementById('searchQuery');
    const tempoRange = document.getElementById('tempoRange');
    const tempoDisplay = document.getElementById('tempoDisplay');

   // 1. Temposäätimen logiikka
    if (tempoRange) {
        tempoRange.addEventListener('input', (e) => {
            console.log("Slideria liikutettu:", e.target.value); // Debug-viesti
            changeTempo(e.target.value);
        });
    }

    // 2. Esikatselun päivitys
    if (abcEditor) {
        abcEditor.addEventListener('input', () => {
            processAbc(); 
        });
    }

    // 3. Kesto-napit
    document.querySelectorAll('.dur-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDuration = btn.getAttribute('data-dur');
        });
    });

    // 4. Piste-nappi
    const dotBtn = document.getElementById('dot-btn');
    if (dotBtn) {
        dotBtn.addEventListener('click', (e) => {
            isDottedMode = !isDottedMode;
            e.target.classList.toggle('active', isDottedMode);
        });
    }

    // 5. Etumerkki-napit
    document.querySelectorAll('.acc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedAccidental = btn.classList.contains('active') ? "" : btn.getAttribute('data-acc');
            document.querySelectorAll('.acc-btn').forEach(b => b.classList.remove('active'));
            if (selectedAccidental) btn.classList.add('active');
        });
    });

    // 6. Nuotti-napit
    document.querySelectorAll('.note-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const note = btn.getAttribute('data-note');
            // --- UUSI OSA: SOITETAAN SÄVEL ---
        // Muodostetaan nuotti etumerkillä, jotta se kuulostaa oikealta
        const noteToPlay = selectedAccidental + note;
        playSingleNote(noteToPlay);
        // ---------------------------------
            let dur = selectedDuration;
            
            if (isDottedMode && note !== 'z') {
                if (selectedDuration === "1") dur = "3/2";
                else if (selectedDuration === "2") dur = "3";
                else if (selectedDuration === "/2") dur = "3/4";
                else if (selectedDuration === "/4") dur = "3/8";
                isDottedMode = false;
                if (dotBtn) dotBtn.classList.remove('active');
            } else if (selectedDuration === "1") {
                dur = "";
            }

            const noteString = selectedAccidental + note + dur + " ";
            const start = abcEditor.selectionStart;
            const end = abcEditor.selectionEnd;
            
            abcEditor.value = abcEditor.value.slice(0, start) + noteString + abcEditor.value.slice(end);
            abcEditor.selectionStart = abcEditor.selectionEnd = start + noteString.length;
            
            selectedAccidental = "";
            document.querySelectorAll('.acc-btn').forEach(b => b.classList.remove('active'));
            abcEditor.focus();

            processAbc(); 
        });
    });



    // 8. Backspace-painike
    const backspaceBtn = document.getElementById('backspace-btn');
    if (backspaceBtn) {
        backspaceBtn.addEventListener('click', () => {
            const start = abcEditor.selectionStart;
            const end = abcEditor.selectionEnd;
            const value = abcEditor.value;

            if (start === end && start > 0) {
                abcEditor.value = value.slice(0, start - 1) + value.slice(end);
                abcEditor.selectionStart = abcEditor.selectionEnd = start - 1;
            } else if (start !== end) {
                abcEditor.value = value.slice(0, start) + value.slice(end);
                abcEditor.selectionStart = abcEditor.selectionEnd = start;
            }

            processAbc(); 
            abcEditor.focus();
        });
    }
    
// 9. Tyhjennys
const clearBtn = document.getElementById('clearSearch'); // <-- LISÄÄ TÄMÄ RIVI
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        abcEditor.value = "";
        processAbc();
    });
}


}); // Tämä sulkee DOMContentLoaded-funktion oikein