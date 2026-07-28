 window.melodyLibrary = [];

const urls = [
    "sessionSet01.js", "sessionSet02.js", "sessionSet03.js", "sessionSet04.js",
    "sessionSet05.js", "sessionSet06.js", "sessionSet07.js", "sessionSet08.js",
    "sessionSet09.js", "sessionSet10.js", "sessionSet11.js", "sessionSet12.js",
    "sessionSet13.js", "sessionSet14.js", "sessionSet15.js", "sessionSet16.js",
    "sessionSet17.js", "sessionSet18.js", "folkwikiSet1.js", "folkwikiSet2.js",
    "folkwikiSet3.js", "fsfolkdiktning01.js", "esavelmat_kansantanssit.js", 
    "esavelmat_kjs.js", "esavelmat_rs1.js", "esavelmat_rs2.js", "esavelmat_hs1.js",
    "esavelmat_ls1.js", "esavelmat_ls2.js", "esavelmat_ls3.js", "esavelmat_ls4.js",
    "suomitest3.js", "fsfolkdiktning02.js", "FinnishTunes.js", "FinnishTunes2.js", 
    "swedish2.js", "norway1.js", "dansk1.js", "dansk2.js", "dansk3.js", "abctransposer.js", "nordbeck.js", "folkwikiExtra.js", "extrasetti5.js"
];

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

function getFingerprint(abc) {
    if (!abc) return "";

    // 1. ETSITÄÄN SÄVELLAJI ENSIN (ennen mitään siivousta!)
    const keyMatch = abc.match(/^K:\s*([A-G][#b]?)\s*([A-Za-z]*)/m);
    let root = keyMatch ? keyMatch[1] : "C";
    let mode = keyMatch && keyMatch[2] ? keyMatch[2].toLowerCase() : "maj";

    const modeOffsets = {
        'maj': 0, 'major': 0, 'ion': 0, 'ionian': 0, 'mix': -1, 'mixolydian': -1,
        'lyd': 1, 'lydian': 1, 'dor': -2, 'dorian': -2, 'min': -3, 'minor': -3, 
        'm': -3, 'aeo': -3, 'aeolian': -3, 'phr': -4, 'phrygian': -4, 'loc': -5, 'locrian': -5
    };

    const circleOfFifths = {
        'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
        'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
    };

    let sharpCount = (circleOfFifths[root] || 0) + (modeOffsets[mode] || 0);
    const sharpsOrder = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    const flatsOrder = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    const keyRules = {};

    if (sharpCount > 0) {
        for (let i = 0; i < sharpCount; i++) keyRules[sharpsOrder[i]] = '^';
    } else if (sharpCount < 0) {
        for (let i = 0; i < Math.abs(sharpCount); i++) keyRules[flatsOrder[i]] = '_';
    }

    // 2. NYT SIIVOTAAN TEKSTI (järjestys on kriittinen)
    let clean = abc;
    
    // Poistetaan %-alkuiset kommentit ja direktiivit (esim. %%abc-charset utf-8)
    clean = clean.replace(/^\s*%.*$/gm, "");
    
    // Poistetaan ABC-otsikkorivit (K:, X:, T:, w: jne.)
    clean = clean.replace(/^\s*[a-zA-Z]:.*$/gm, "");
    
    // Poistetaan kitarasoinnut ("G", "Am")
    clean = clean.replace(/"[^"]*"/g, "");
    
    // Poistetaan korusävelet
    clean = clean.replace(/\{[^}]*\}/g, "");
    
    // Poistetaan trillit, rollit, dynamiikkamerkit ja kaaret
    clean = clean.replace(/[T~.!+()]/g, "");
    
    // Poistetaan loput sotkut kuten sointusulut ja kertausmerkit (jätetään tahtiviiva | )
    clean = clean.replace(/[><:\[\]]/g, "");

    // 3. LUETAAN NUOTIT
    const regex = /([|])|([\^_=]?)([A-Ga-gHh])([,']*)([0-9/]*)/g;
    let notes = [];
    let barAccidentals = {}; 
    let match;

    // Sisäinen apufunktio nuotin korkeudelle
    function getPitchValue(acc, note, oct) {
        // Lisätty H (pohjoismainen merkintätapa B:lle)
        const basePitches = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11, 'H': 11 };
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

    while ((match = regex.exec(clean)) !== null) {
        if (match[1] === '|') {
            barAccidentals = {}; 
            continue;
        }
        let acc = match[2];
        let note = match[3];
        const oct = match[4];
        const durStr = match[5];
        
        let noteName = note.toUpperCase();
        if (noteName === 'H') noteName = 'B'; // Normalisoidaan H vastaamaan B:tä

        if (acc) {
            if (acc === "=") acc = "";
            barAccidentals[noteName] = acc;
        } else {
            acc = barAccidentals.hasOwnProperty(noteName) ? barAccidentals[noteName] : (keyRules[noteName] || "");
        }

        let pitch = getPitchValue(acc, note, oct);
        let duration = 1;
        if (durStr) {
            if (durStr.includes('/')) {
                let parts = durStr.split('/');
                duration = (parseFloat(parts[0]) || 1) / (parseFloat(parts[1]) || 2);
            } else {
                duration = parseFloat(durStr);
            }
        }
        notes.push({ pitch, duration });
    }

    // 4. LASKETAAN SORMENJÄLKI
    if (notes.length < 2) return "";
    let fp = [];
    for (let i = 1; i < notes.length; i++) {
        let interval = notes[i].pitch - notes[i-1].pitch;
        let ratio = notes[i].duration / notes[i-1].duration;
        let durRatio = Number(ratio.toFixed(1));
        fp.push(`${interval}:${durRatio}`);
    }
    return "|" + fp.join("|") + "|";
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

async function initApp() {
    const loaderBar = document.getElementById("loader-bar");
    const loaderPercent = document.getElementById("loader-percent");
    const loaderContainer = document.getElementById("loader-container");

    for (let i = 0; i < urls.length; i++) {
        try {
            const response = await fetch(urls[i]);
            const text = await response.text();
            const startIdx = text.indexOf('[');
            const endIdx = text.lastIndexOf(']');
            
            if (startIdx !== -1 && endIdx !== -1) {
                const data = new Function('return ' + text.substring(startIdx, endIdx + 1))();
                if (Array.isArray(data)) {
                    data.forEach(tune => {
                        if (tune.abc) {
                            tune.fingerprint = getFingerprint(tune.abc);
                            window.melodyLibrary.push(tune);
                        }
                    });
                }
            }
            const progress = Math.round(((i + 1) / urls.length) * 100);
            if (loaderBar) loaderBar.style.width = progress + "%";
            if (loaderPercent) loaderPercent.textContent = progress + "%";
        } catch (e) { console.error(e); }
    }
    if (loaderContainer) loaderContainer.style.display = 'none';
}

function handleSearch() {

    if (ABCJS.synth.supportsAudio()) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
    const abcEditor = document.getElementById('searchQuery');
    const input = abcEditor.value;
    const searchBtn = document.getElementById('search-btn');

    if (input.replace(/\s/g, "").length < 3) {
        alert("Kirjoita vähintään 3 nuottia ennen hakua.");
        return;
    }

    // Muutetaan napin teksti hetkeksi
    searchBtn.innerText = "Etsitään...";
    searchBtn.disabled = true;

    // Käytetään setTimeoutia, jotta "Etsitään..." ehtii piirtyä ennen raskasta hakua
    setTimeout(() => {
        let rawFP = getFingerprint(input);
        if (!rawFP) {
            searchBtn.innerText = "Hae kappaleita";
            searchBtn.disabled = false;
            return;
        }

        let searchIntervals = rawFP.split('|')
                                   .filter(x => x.length > 0)
                                   .map(x => x.split(':')[0])
                                   .join('|');

        const matches = window.melodyLibrary.filter(t => {
            if (!t.fingerprint) return false;
            let libIntervals = t.fingerprint.split('|')
                                           .filter(x => x.length > 0)
                                           .map(x => x.split(':')[0])
                                           .join('|');
            return libIntervals.includes(searchIntervals);
        });

        const list = document.getElementById('results-list');
        document.getElementById('match-count').innerText = matches.length;
        list.innerHTML = "";

        matches.slice(0, 50).forEach(tune => {
    const div = document.createElement('div');
    div.className = 'tune-card';

    let displayName = tune.name;
    const abc = tune.abc;

    // Apufunktio kentän poimimiseen (varmempi versio)
    function getAbcField(fieldTag) {
        const tag = "\n" + fieldTag + ":";
        const startIdx = abc.indexOf(tag);
        if (startIdx === -1) return null;

        let contentStart = startIdx + tag.length;
        let remaining = abc.substring(contentStart);
        
        // Etsitään loppukohta (joko oikea rivinvaihto tai \n-teksti)
        let endIdx = remaining.indexOf("\n");
        let altEndIdx = remaining.indexOf("\\n");
        let finalEnd;
        
        if (endIdx !== -1 && altEndIdx !== -1) finalEnd = Math.min(endIdx, altEndIdx);
        else finalEnd = (endIdx !== -1) ? endIdx : altEndIdx;

        let result = (finalEnd !== -1) ? remaining.substring(0, finalEnd) : remaining;
        return result.replace(/[\\"]/g, "").trim();
    }

    let metaParts = [];
    const nameUpper = tune.name.toUpperCase();

    // SÄÄNTÖ 1: VIA-alkuiset (aiempi sääntö)
    if (nameUpper.startsWith("VIA")) {
        const rVal = getAbcField("R");
        const sVal = getAbcField("S");
        if (rVal && rVal !== "-") metaParts.push(rVal);
        if (sVal && sVal !== "-") metaParts.push(sVal);
    } 
    // SÄÄNTÖ 2: kt1, rs1, rs2 -> M: ja O:
    else if (nameUpper.startsWith("KT1") || nameUpper.startsWith("RS1") || nameUpper.startsWith("RS2")) {
        const mVal = getAbcField("M");
        const oVal = getAbcField("O");
        if (mVal && mVal !== "-") metaParts.push(mVal);
        if (oVal && oVal !== "-") metaParts.push(oVal);
    }
    // SÄÄNTÖ 3: hs1 -> N: ja O:
    else if (nameUpper.startsWith("HS1")) {
        const nVal = getAbcField("N");
        const oVal = getAbcField("O");
        if (nVal && nVal !== "-") metaParts.push(nVal);
        if (oVal && oVal !== "-") metaParts.push(oVal);
    }
    // SÄÄNTÖ 4: ls1, ls2, ls3, ls4 -> "laulusävelmä" ja O:
    else if (/^LS[1-4]/.test(nameUpper)) {
        metaParts.push("laulusävelmä");
        const oVal = getAbcField("O");
        if (oVal && oVal !== "-") metaParts.push(oVal);
    }

    // Yhdistetään ja lisätään nimen perään
    if (metaParts.length > 0) {
        let combinedMeta = metaParts.join(", ");
        if (combinedMeta.length > 70) combinedMeta = combinedMeta.substring(0, 67) + "...";
        displayName += ` <span class="meta-info">(${combinedMeta})</span>`;
    }

    div.innerHTML = `<h3>${displayName}</h3>`;
     
    div.onclick = function() {
        currentAbc = tune.abc;
        
        // 1. Puhdistetaan vanhat tempot ja pakotetaan AINA Q:100 pohjalle
        let cleanAbc = currentAbc.replace(/^Q:.*$/gm, "").trim();
        let abcWithTempo = "Q:100\n" + cleanAbc;
        
        // 2. Piirretään nuotit
        visualObj = ABCJS.renderAbc("paper", abcWithTempo, { 
            responsive: 'resize',
            paddingbottom: 35 
        })[0];

        // 3. Tuodaan soitin näkyviin
        const audioContainer = document.getElementById('audio-controls');
        if (audioContainer) {
            audioContainer.style.display = 'block';
            audioContainer.innerHTML = ""; 
        }

        // 4. Alustetaan audio
        if (ABCJS.synth.supportsAudio()) {
            if (!window.myAudioContext) {
                window.myAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Pysäytetään vanha soitto
            if (synthControl) synthControl.pause();

            const synth = new ABCJS.synth.CreateSynth();
            synth.init({ 
                visualObj: visualObj,
                audioContext: window.myAudioContext 
            }).then(function() {
                if (!synthControl) {
                    synthControl = new ABCJS.synth.SynthController();
                }
                
                synthControl.load("#audio-controls", null, {
                    displayRestart: true,
                    displayPlay: true,
                    displayProgress: true,
                    displayWarp: true 
                });
                
                // Ladataan perusbiisi (Q:100) ohjaimeen
                return synthControl.setTune(visualObj, false);
            }).then(function() {
                // TAIKA TAPAHTUU TÄSSÄ: Pakotetaan sliderin nopeus warp-komennolla HETI
                const currentSliderValue = parseInt(document.getElementById('tempoRange').value) || 100;
                synthControl.setWarp(currentSliderValue);
            }).catch(function(err) {
                console.warn("Audioalustus epäonnistui:", err);
            });
        }
        
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    // Tämän jälkeen listaan lisääminen ja silmukan sulkeminen
    list.appendChild(div);
}); // Sulkee matches.slice.forEach

// Palautetaan nappi ennalleen
searchBtn.innerText = "Hae kappaleita";
searchBtn.disabled = false;
}, 50); // Sulkee handleSearchin sisällä olevan setTimeoutin
} // Sulkee handleSearch-funktion

// --- TAPAHTUMAT ---



document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
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
            ABCJS.renderAbc("search-preview", "L:1/4\nM:none\n" + abcEditor.value, { 
                responsive: 'resize', 
                scale: 0.7 
            });
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

            ABCJS.renderAbc("search-preview", "L:1/4\nM:none\n" + abcEditor.value, { 
                responsive: 'resize', 
                scale: 0.7 
            });
        });
    });

    // 7. Hae-nappi
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            handleSearch();
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

            ABCJS.renderAbc("search-preview", "L:1/4\nM:none\n" + abcEditor.value, { 
                responsive: 'resize', 
                scale: 0.7 
            });
            abcEditor.focus();
        });
    }
    
    // 9. Tyhjennys
    const clearBtn = document.getElementById('clearSearch');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            abcEditor.value = "";
            document.getElementById('results-list').innerHTML = "";
            document.getElementById('match-count').innerText = "0";
            ABCJS.renderAbc("search-preview", ""); 
        });
    }
}); // Tämä sulkee DOMContentLoaded-funktion oikein
