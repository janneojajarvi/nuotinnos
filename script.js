 

let selectedDuration = "1";
let selectedAccidental = ""; 
let isDottedMode = false;
let synthControl;
let currentAbc;
let visualObj; // Globaali muuttuja temposäädintä varten

const STORAGE_KEY = "abc-notebook";

const helpExamples = [

{
    title: "Nuotit eri oktaaveissa",
    text: "Sävelnimet neljässä oktaavissa.",
    abc:
`C, D, E, F, G, A, B,
C D E F G A B
c d e f g a b
c' d' e' f' g' a' b'`
},

{
    title: "Tauot",
    text: "Eripituisia taukoja.",
    abc:
`z
z2
z/2
z/4`
},

{
    title: "Nuottien kestot",
    text: "Perus- ja eripituiset nuotit.",
    abc:
`C
C2
C3
C/2
C/4`
},

{
    title: "Pisteelliset nuotit",
    text: "Pisteelliset kestot.",
    abc:
`C3/2
C3
C3/4`
},

{
    title: "Tahtiviivat",
    text: "Yleisimmät tahtiviivat.",
    abc:
`|
||
|]
[|`,
},

{
    title: "Kertaus",
    text: "Kertausmerkit.",
    abc:
`|:
:|
|: C D E F :|`
},

{
    title: "1. ja 2. maali",
    text: "Ensimmäinen ja toinen lopuke.",
    abc:
`|: C D |[1 E F :|[2 G A ||`
},

{
    title: "Sidoskaari",
    text: "Sido kaksi saman sävelen nuottia.",
    abc:
`C-C`
},

{
    title: "Legato",
    text: "Fraasikaari.",
    abc:
`(CDEF)`
},

{
    title: "Trioli",
    text: "Kolme samanarvoista nuottia kahden ajassa.",
    abc:
`(3CDE
(3FGA
(3cBA`
},

{
    title: "Staccato",
    text: "Staccatopiste.",
    abc:
`!.!C D !.!E F`
},

{
    title: "Koristeet",
    text: "Yleisimmät koristeet.",
    abc:
`!trill!C
!turn!D
!mordent!E
!fermata!F`
},

{
    title: "Soinnut",
    text: "Sointumerkit nuottien yläpuolella.",
    abc:
`"C"C
"G"G
"Am"A
"D7"D`
},

{
    title: "Sanat",
    text: "Sanat nuottien alle.",
    abc:
`C D E F
w: sa-na-t`
}

];

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

function renderHelp() {

    const container = document.getElementById("helpContent");

    container.innerHTML = "";

    helpExamples.forEach(example => {

        const div = document.createElement("div");
        div.className = "help-example";

        div.innerHTML = `
            <h3>${example.title}</h3>
            <p>${example.text}</p>
            <pre>${example.abc}</pre>
            <button class="insertExampleBtn">
                Lisää editoriin
            </button>
        `;

        div.querySelector("button").addEventListener("click", () => {

            const editor = document.getElementById("searchQuery");

            const start = editor.selectionStart;
            const end = editor.selectionEnd;

            editor.value =
                editor.value.substring(0,start) +
                example.abc +
                editor.value.substring(end);

            editor.selectionStart =
            editor.selectionEnd =
                start + example.abc.length;

            editor.focus();

            processAbc();

        });

        container.appendChild(div);

    });

}

function renameTune() {

    const editor = document.getElementById("searchQuery");

    const match = editor.value.match(/^T:(.*)$/m);
    const currentTitle = match ? match[1].trim() : "";

    const newTitle = prompt("Kappaleen nimi:", currentTitle);

    if (newTitle === null) return;

    const title = newTitle.trim();

    if (!title) {
        alert("Anna kappaleelle nimi.");
        return;
    }

    if (/^T:/m.test(editor.value)) {
        editor.value = editor.value.replace(
            /^T:.*$/m,
            `T:${title}`
        );
    } else {
        editor.value = `T:${title}\n` + editor.value;
    }

    processAbc();

const keyMatch = editor.value.match(/^K:.*$/m);

if (keyMatch) {
    const pos = keyMatch.index + keyMatch[0].length + 1;
    editor.focus();
    editor.selectionStart = editor.selectionEnd = pos;
}
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

    let name = getTuneTitle();

if (!name) {
    renameTune();
    name = getTuneTitle();

    if (!name) return;
}

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

function setKeySignature(newKey) {

    const editor = document.getElementById("searchQuery");

    if (/^K:/m.test(editor.value)) {
        editor.value = editor.value.replace(
            /^K:.*$/m,
            `K:${newKey}`
        );
    } else {
        editor.value += `\nK:${newKey}\n`;
    }

    processAbc();
}



function newTune() {

    if (!confirm("Tyhjennetäänkö nykyinen kappale?")) return;

    const editor = document.getElementById("searchQuery");

    editor.value = getNewTuneTemplate();

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

function getCurrentKey() {
    const abc = document.getElementById("searchQuery").value;
    const match = abc.match(/^K:\s*([^\s]+)/m);
    return match ? match[1] : "C";
}

function getKeyAccidentals(key) {

    const sharpOrder = ["F","C","G","D","A","E","B"];
    const flatOrder  = ["B","E","A","D","G","C","F"];

    const majorKeys = {
        C:0, G:1, D:2, A:3, E:4, B:5,
        "F#":6, "C#":7,
        F:-1, Bb:-2, Eb:-3, Ab:-4,
        Db:-5, Gb:-6, Cb:-7
    };

    // Muutetaan mollit rinnakkaisduureiksi
    const minorMap = {
        Am:"C",
        Em:"G",
        Bm:"D",
        "F#m":"A",
        "C#m":"E",
        "G#m":"B",
        "D#m":"F#",
        "A#m":"C#",
        Dm:"F",
        Gm:"Bb",
        Cm:"Eb",
        Fm:"Ab",
        Bbm:"Db",
        Ebm:"Gb",
        Abm:"Cb"
    };

    if (minorMap[key])
        key = minorMap[key];

    const count = majorKeys[key] ?? 0;

    const acc = {};

    if (count > 0) {
        for (let i=0;i<count;i++)
            acc[sharpOrder[i]]="^";
    }

    if (count < 0) {
        for (let i=0;i<-count;i++)
            acc[flatOrder[i]]="_";
    }

    return acc;
}

function getNewTuneTemplate() {
    return `X:1
T:Uusi kappale
M:4/4
L:1/4
K:C
`;
}


function getPlaybackNote(note) {

    // Käyttäjä valitsi itse etumerkin
    if (selectedAccidental)
        return selectedAccidental + note;

    const acc = getKeyAccidentals(getCurrentKey());

    return (acc[note.toUpperCase()] || "") + note;
}


function exportAbc() {

    const abc = document.getElementById("searchQuery").value.trim();

    if (!abc) {
        alert("Ei vietävää nuottia.");
        return;
    }

    // Otetaan tiedostonimi T:-kentästä
    let fileName = "untitled";

    const titleMatch = abc.match(/^T:(.*)$/m);

    if (titleMatch) {
        fileName = titleMatch[1]
            .trim()
            .replace(/[\\/:*?"<>|]/g, "_");
    }

    const blob = new Blob([abc], {
        type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName + ".abc";

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getTuneTitle() {

    const editor = document.getElementById("searchQuery");

    const match = editor.value.match(/^T:(.*)$/m);

    return match ? match[1].trim() : "";

}

function getMeter() {

    const abc = document.getElementById("searchQuery").value;

    const m = abc.match(/^M:(.*)$/m);

    return m ? m[1].trim() : "4/4";

}


function getBeamGroup() {

    const meter = getMeter();

    switch (meter) {

        case "2/4":
            return 2;

        case "3/4":
            return 2;

        case "4/4":
            return 2;

        case "6/8":
            return 3;

        case "9/8":
            return 3;

        case "12/8":
            return 3;

        default:
            return null;
    }

}

function getNoteLength(note, defaultLength = 1) {

    const m = note.match(/(\d+\/\d+|\/\d+|\d+)$/);

    if (!m) return defaultLength;

    const len = m[1];

    if (len.startsWith("/")) {
        return 1 / parseInt(len.slice(1));
    }

    if (len.includes("/")) {
        const [a,b] = len.split("/");
        return parseInt(a) / parseInt(b);
    }

    return parseInt(len);
}

function getBeatLength() {

    switch (getMeter()) {

        case "2/4":
        case "3/4":
        case "4/4":
            return 1;

        case "6/8":
        case "9/8":
        case "12/8":
            return 1.5;

        default:
            return 1;
    }
}


function isSixteenth(note) {
    return /\/4\b/.test(note);
}

function optimizeBeaming() {

    const group = getBeamGroup();

    if (!group) {
        alert("Tahtilajia ei vielä tueta.");
        return;
    }

    const editor = document.getElementById("searchQuery");
    const lines = editor.value.split("\n");

    // Tunnistaa yhden ABC-nuotin tai tauon
    const noteRegex =
        /(\^\^|\^|__|_|=)?[A-Ga-gz][,']*(\d+\/\d+|\/\d+|\d+)?/g;

    for (let i = 0; i < lines.length; i++) {

        // Ohitetaan metatiedot
        if (/^[A-Z]:/.test(lines[i]))
            continue;

        const bars = lines[i].split("|");

        for (let b = 0; b < bars.length; b++) {

            // Poimitaan kaikki nuotit riippumatta välilyönneistä
            const notes = [...bars[b].matchAll(noteRegex)]
                .map(m => m[0]);

            if (!notes.length) continue;

            let result = "";
let beatPos = 0;

for (const note of notes) {

    result += note;

    beatPos += getNoteLength(note);

    if (Math.abs(beatPos - getBeatLength()) < 0.0001) {
        result += " ";
        beatPos = 0;
    }
}

            bars[b] = result.trim();
        }

        lines[i] = bars.join(" | ");
    }

    editor.value = lines.join("\n");

    processAbc();
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
    
    const match = currentAbc.match(/^K:\s*([^\s]+)/m);

if (match) {
    const keySelect = document.getElementById("keySelect");
    if (keySelect)
        keySelect.value = match[1];
}

    // Käytetään kopiota editorin tekstistä
    let abc = currentAbc;

    // Poistetaan vain vanhat Q:-rivit
    abc = abc.replace(/^Q:.*$/gm, "");

    // Lisätään Q:100 ennen ensimmäistä K:-riviä
    if (/^K:/m.test(abc)) {
        abc = abc.replace(/^K:(.*)$/m, `Q:100\nK:$1`);
    } else {
        abc = "Q:100\nK:C\n" + abc;
    }

    // Päivitetään nuottiavain säilyttäen sävellaji
    abc = abc.replace(/^K:([^\n]*)$/m, (match, key) => {
        key = key.replace(/\s+clef=\S+/g, "").trim();
        return `K:${key} clef=${selectedClef}`;
    });

    visualObj = ABCJS.renderAbc("paper", abc, {
        responsive: "resize",
        paddingbottom: 35
    })[0];

    initPlayer();
}



// --- TAPAHTUMAT ---



const keySelect = document.getElementById("keySelect");

if (keySelect) {
    keySelect.addEventListener("change", () => {
        setKeySignature(keySelect.value);
    });
}

document.getElementById("exportAbcBtn")
    .addEventListener("click", exportAbc);

document.getElementById("saveBtn")
    .addEventListener("click", saveTune);

document.getElementById("openBtn")
    .addEventListener("click", openTune);

document.getElementById("newBtn")
    .addEventListener("click", newTune);

document.addEventListener('DOMContentLoaded', () => {
   const editor = document.getElementById("searchQuery");

    if (!editor.value.trim()) {
        editor.value = getNewTuneTemplate();
    }

    document.getElementById("helpBtn")
.addEventListener("click", () => {

    renderHelp();

    document.getElementById("helpModal")
        .classList.remove("hidden");

});

document.getElementById("beamBtn")
    .addEventListener("click", optimizeBeaming);

document.getElementById("renameBtn")
    .addEventListener("click", renameTune);

document.getElementById("closeHelpBtn")
    .addEventListener("click", () => {
        document.getElementById("helpModal")
            .classList.add("hidden");
    });
   
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
        const noteToPlay = getPlaybackNote(note);
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

processAbc();

}); // Tämä sulkee DOMContentLoaded-funktion oikein