 

let selectedDuration = "1";
let selectedAccidental = ""; 
let isDottedMode = false;
let synthControl;
let currentAbc;
let visualObj; // Globaali muuttuja temposäädintä varten

const STORAGE_KEY = "abc-notebook";

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

// Transponoi kaikki tekstikentän nuotit oktaavilla ylös (+1) tai alas (-1)
function transposeOctave(direction) {
    const abcEditor = document.getElementById('searchQuery');
    if (!abcEditor || !abcEditor.value.trim()) return;



    // Säännöllinen lauseke tunnistaa nuotit (etumerkki, sävelkirjain A-G/a-g ja oktaavimerkit , tai ')
    const regex = /(?<![a-zA-Z])(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)(?![a-zA-Z])/g;

    abcEditor.value = abcEditor.value.replace(regex, (match, acc = "", note, oct = "") => {
        let newNote = note;
        let newOct = oct;

        if (direction === 1) { // Oktaavi ylöspäin
            if (newOct.includes(',')) {
                newOct = newOct.replace(',', ''); // C, -> C
            } else if (note === note.toUpperCase()) {
                newNote = note.toLowerCase();   // C -> c
            } else {
                newOct += "'";                  // c -> c'
            }
        } else if (direction === -1) { // Oktaavi alaspäin
            if (newOct.includes("'")) {
                newOct = newOct.replace("'", ''); // c' -> c
            } else if (note === note.toLowerCase()) {
                newNote = note.toUpperCase();   // c -> C
            } else {
                newOct += ",";                  // C -> C,
            }
        }

        return acc + newNote + newOct;
    });

    // Päivitetään nuottikuva ja soitin
    processAbc();
}


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

function saveTune() {

    const name = prompt("Kappaleen nimi:");

    if (!name) return;

    let tunes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    const tune = {
        name,
        modified: Date.now(),
        abc: document.getElementById("searchQuery").value
    };

    const existing = tunes.findIndex(t => t.name === name);

    if (existing >= 0) {
        tunes[existing] = tune;
    } else {
        tunes.push(tune);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(tunes));

    alert("Tallennettu.");
}

function openTune(){
    renderLibrary();
    document.getElementById("libraryModal")
        .classList.remove("hidden");
}

function renderLibrary() {

    const tunes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    const list = document.getElementById("libraryList");
    list.innerHTML = "";

    if (tunes.length === 0) {
        list.innerHTML = "<p>Ei tallennettuja kappaleita.</p>";
        return;
    }

    tunes.forEach((tune, index) => {

        const item = document.createElement("div");
        item.className = "library-item";

        const date = new Date(tune.modified).toLocaleString("fi-FI");

        item.innerHTML = `
            <h3>🎼 ${tune.name}</h3>
            <div>${date}</div>

            <div class="library-buttons">
                <button class="open-tune" data-index="${index}">Avaa</button>
                <button class="delete-tune" data-index="${index}">🗑️ Poista</button>
            </div>
        `;

        list.appendChild(item);
    });

    // Avaa
    list.querySelectorAll(".open-tune").forEach(btn => {
        btn.addEventListener("click", () => {

            const i = parseInt(btn.dataset.index);

            document.getElementById("searchQuery").value = tunes[i].abc;

            processAbc();

            document.getElementById("libraryModal")
                .classList.add("hidden");
        });
    });

    // Poista
    list.querySelectorAll(".delete-tune").forEach(btn => {
        btn.addEventListener("click", () => {

            const i = parseInt(btn.dataset.index);

            if (!confirm(`Poistetaanko "${tunes[i].name}"?`))
                return;

            tunes.splice(i, 1);

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(tunes)
            );

            renderLibrary();
        });
    });
}

function newTune() {

    if (!confirm("Tyhjennetäänkö nykyinen kappale?")) return;

    const editor = document.getElementById("searchQuery");

    editor.value =
`X:1
T:Uusi kappale
M:4/4
L:1/8
K:C

`;

    // Siirrä kohdistin tekstin loppuun
    editor.focus();
    editor.selectionStart = editor.selectionEnd = editor.value.length;

    processAbc();
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
    const clefSelect = document.getElementById("clefSelect");
    const selectedClef = clefSelect ? clefSelect.value : "treble";

    currentAbc = editor.value;

    // Siivotaan vanhat Q:, L: ja K: määritykset pois, jotta ne eivät monistu
    const cleanAbc = currentAbc.replace(/^[QLK]:.*$/gm, "").trim();
    
    // Luodaan ABC-otsikko: Aika-arvo L:1/4, Tempo Q:100 ja Nuottiavain K:C clef=...
    const abcHeader = `L:1/4\nQ:100\nK:C clef=${selectedClef}\n`;
    const abcWithHeader = abcHeader + cleanAbc;

    visualObj = ABCJS.renderAbc("paper", abcWithHeader, {
        responsive: "resize",
        paddingbottom: 35
    })[0];

    initPlayer();
}



// --- TAPAHTUMAT ---

document.getElementById("saveBtn")
    .addEventListener("click", saveTune);

document.getElementById("openBtn")
    .addEventListener("click", openTune);

document.getElementById("newBtn")
    .addEventListener("click", newTune);

document.addEventListener('DOMContentLoaded', () => {
   processAbc();  
   
   document.getElementById("closeLibraryBtn")
    .addEventListener("click", () => {
        document.getElementById("libraryModal")
            .classList.add("hidden");
    });
    
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
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            selectedDuration = e.currentTarget.getAttribute('data-dur');
        });
    });


    // PDF / Tulostusnappi
const printBtn = document.getElementById('print-btn');
if (printBtn) {
    printBtn.addEventListener('click', () => {
        const svg = document.querySelector('#paper svg');
        if (svg) {
            // Luetaan ABCJS-nuottikuvan korkeus viewBox-määritteestä ja lukitaan se
            const viewBox = svg.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(' ');
                if (parts.length === 4) {
                    const svgHeight = parts[3];
                    svg.style.minHeight = svgHeight + 'px';
                }
            }
        }
        
        // Avataan tulostusikkuna
        window.print();
    });
}



    // 4. Piste-nappi
    const dotBtn = document.getElementById('dot-btn');
    if (dotBtn) {
        dotBtn.addEventListener('click', (e) => {
            isDottedMode = !isDottedMode;
            e.target.classList.toggle('active', isDottedMode);
        });
    }
    
        // Oktaavinapit
    const octDownBtn = document.getElementById('oct-down-btn');
    const octUpBtn = document.getElementById('oct-up-btn');

    if (octDownBtn) {
        octDownBtn.addEventListener('click', () => transposeOctave(-1));
    }
    if (octUpBtn) {
        octUpBtn.addEventListener('click', () => transposeOctave(1));
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

    // Taktiviiva- ja kertausmerkkinapit (| ja :)
document.querySelectorAll('.bar-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Otetaan merkki ilman automaattista välilyöntiä
        const symbol = e.currentTarget.getAttribute('data-bar');
        const start = abcEditor.selectionStart;
        const end = abcEditor.selectionEnd;
        
        abcEditor.value = abcEditor.value.slice(0, start) + symbol + abcEditor.value.slice(end);
        abcEditor.selectionStart = abcEditor.selectionEnd = start + symbol.length;
        
        abcEditor.focus();
        processAbc();
    });
});


    // Nuottiavaimen vaihto
    const clefSelect = document.getElementById('clefSelect');
    if (clefSelect) {
        clefSelect.addEventListener('change', () => {
            processAbc();
        });
    }



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