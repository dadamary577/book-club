// LightUp Book Club Form Logic

/* LightUp — client-only book reader, quizzes & WhatsApp final note
   Privacy-first: uploaded book text stays in user's browser (localStorage).
   The WhatsApp flow only sends a short final note + Member ID (no book text).
*/

/* ====== Config ====== */
const ownerPhone = "2347044816854"; // admin WhatsApp (international without +)
const STORAGE_KEY = "lightup_book_state_v1";

/* ====== Utilities ====== */
function shortMemberId(){
  // LUBC- + 4 chars base36
  return "LUBC-" + Math.random().toString(36).substring(2,6).toUpperCase();
}
function $(id){return document.getElementById(id);}

/* ====== State ====== */
let state = {
  member: null,         // { id, name, phone, day, startDate, bookTitle }
  book: null,           // { title, text, chapters: [ {title,text,progress,quizTaken,score} ] }
};
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw) try { state = JSON.parse(raw); } catch(e){ console.warn("corrupt state"); localStorage.removeItem(STORAGE_KEY); }
}
loadState();

/* ====== DOM refs ====== */
const memberIdEl = $('memberId');
const joinForm = $('joinForm');
const joinBtn = $('joinBtn');
const resetBtn = $('resetBtn');
const joinMsg = $('joinMsg');
const fileInput = $('fileInput');
const fileMsg = $('fileMsg');

const currentBookTitle = $('currentBookTitle');
const chapterList = $('chapterList');
const chapterCount = $('chapterCount');
const overallProgress = $('overallProgress');

const chapterTitle = $('chapterTitle');
const chapterText = $('chapterText');
const chapterProgress = $('chapterProgress');
const markDoneBtn = $('markDoneBtn');
const takeQuizBtn = $('takeQuizBtn');

const sessionName = $('sessionName');
const sessionId = $('sessionId');
const sessionDayDate = $('sessionDayDate');
const sessionStatus = $('sessionStatus');

const finalNote = $('finalNote');
const sendFinalBtn = $('sendFinalBtn');
const sendMsg = $('sendMsg');

const quizModal = $('quizModal');
const closeQuiz = $('closeQuiz');
const quizArea = $('quizArea');
const quizTitle = $('quizTitle');
const submitQuiz = $('submitQuiz');
const quizResult = $('quizResult');

/* ====== Initialize UI from state ====== */
function refreshMemberUI(){
  if(state.member){
    memberIdEl.textContent = state.member.id;
    sessionName.textContent = state.member.name;
    sessionId.textContent = state.member.id;
    sessionDayDate.textContent = (state.member.day || '-') + " / " + (state.member.startDate || '-');
    sessionStatus.textContent = state.book ? 'Book loaded' : 'No book yet';
  } else {
    const mid = shortMemberId();
    memberIdEl.textContent = mid;
    sessionName.textContent = '-';
    sessionId.textContent = '-';
    sessionDayDate.textContent = '-';
    sessionStatus.textContent = 'Not started';
  }
}
function refreshBookUI(){
  if(state.book){
    currentBookTitle.textContent = state.book.title || 'Untitled';
    chapterCount.textContent = state.book.chapters.length;
    const overall = computeOverallProgress();
    overallProgress.textContent = overall + "%";
    // chapter list
    chapterList.innerHTML = '';
    state.book.chapters.forEach((ch,i)=>{
      const btn = document.createElement('button');
      btn.textContent = (i+1) + ". " + (ch.title || ("Chapter " + (i+1)));
      btn.className = (i === (state.book.currentIndex||0)) ? 'active' : '';
      btn.onclick = ()=>selectChapter(i);
      chapterList.appendChild(btn);
    });
    // select current index
    selectChapter(state.book.currentIndex || 0);
  } else {
    currentBookTitle.textContent = 'No book loaded';
    chapterCount.textContent = '0';
    chapterList.innerHTML = '';
    chapterText.textContent = 'Upload a book and choose a chapter to start reading.';
    chapterTitle.textContent = '—';
    chapterProgress.value = 0;
    overallProgress.textContent = '0%';
  }
}
function computeOverallProgress(){
  if(!state.book) return 0;
  const arr = state.book.chapters.map(c => c.progress||0);
  if(arr.length===0) return 0;
  const avg = Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  return avg;
}
function selectChapter(idx){
  if(!state.book) return;
  state.book.currentIndex = idx;
  const ch = state.book.chapters[idx];
  chapterTitle.textContent = ch.title || ("Chapter " + (idx+1));
  chapterText.textContent = ch.text || "[empty chapter]";
  chapterProgress.value = ch.progress || 0;
  // update active in list
  Array.from(chapterList.children).forEach((b,i)=>b.className = (i===idx)?'active':'');
  saveState(); refreshBookUI();
}

/* ====== Join form handlers ====== */
joinForm.addEventListener('submit', e=>{
  e.preventDefault();
  const name = joinForm.querySelector('#name').value.trim();
  const phone = joinForm.querySelector('#phone').value.trim();
  const bookTitle = joinForm.querySelector('#bookTitle').value.trim();
  const day = joinForm.querySelector('#day').value;
  const startDate = joinForm.querySelector('#startDate').value;
  const consent = joinForm.querySelector('#consent').checked;

  if(!name || !phone || !bookTitle || !day || !startDate || !consent){
    joinMsg.textContent = "Please fill all fields and give consent.";
    return;
  }

  state.member = { id: state.member ? state.member.id : shortMemberId(), name, phone, bookTitle, day, startDate };
  saveState();
  joinMsg.textContent = `Welcome, ${name}! Your Member ID is ${state.member.id}. Now upload your book below.`;
  refreshMemberUI();
  refreshBookUI();
});

resetBtn.addEventListener('click', ()=>{
  if(confirm("Reset all local data? This removes the uploaded book and progress on this device.")){
    localStorage.removeItem(STORAGE_KEY);
    state = { member:null, book:null };
    loadState();
    refreshMemberUI(); refreshBookUI();
    joinMsg.textContent = "Reset complete.";
    fileMsg.textContent = "";
  }
});

/* ====== File upload & chapter parsing ====== */
fileInput.addEventListener('change', async (ev)=>{
  const file = ev.target.files[0];
  if(!file){ fileMsg.textContent = "No file selected."; return; }
  const allowed = ['text/plain','text/markdown','application/octet-stream'];
  // we accept .txt and .md — many phones report octet-stream for .txt
  const reader = new FileReader();
  reader.onload = (e)=>{
    const text = e.target.result;
    if(!text || text.trim().length < 30){
      fileMsg.textContent = "File empty or too small. Please upload a .txt file with book text.";
      return;
    }
    const title = state.member && state.member.bookTitle ? state.member.bookTitle : (file.name || "Uploaded Book");
    const chapters = parseChaptersFromText(text);
    state.book = { title, text, chapters, currentIndex: 0 };
    saveState();
    fileMsg.textContent = `Loaded "${title}" — ${chapters.length} chapter(s) detected.`;
    refreshBookUI();
  };
  reader.onerror = ()=> fileMsg.textContent = "Unable to read file.";
  reader.readAsText(file, 'UTF-8');
});

/* Chapter parser:
   - First try to split by lines that start with "Chapter" (case-insensitive).
   - If none found, split into equal chunks (~9000 characters) and label them Chapter 1..N.
*/
function parseChaptersFromText(txt){
  // normalize line endings
  const normalized = txt.replace(/\r\n/g,'\n');
  const lines = normalized.split('\n');
  // find chapter heading indexes
  const headIdx = [];
  for(let i=0;i<lines.length;i++){
    if(/^\s*(chapter\s+\d+|chapter\b|^CHAPTER\b|^CHAPTER\s*\d+)/i.test(lines[i])){
      headIdx.push(i);
    }
  }
  const chapters = [];
  if(headIdx.length >= 2){
    // use found headings
    for(let i=0;i<headIdx.length;i++){
      const start = headIdx[i];
      const end = (i+1 < headIdx.length) ? headIdx[i+1] : lines.length;
      const title = lines[start].trim() || `Chapter ${i+1}`;
      const text = lines.slice(start+1,end).join('\n').trim();
      chapters.push({ title, text, progress:0, quizTaken:false, score:0 });
    }
  } else {
    // fallback - chunk by size
    const approx = 9000; // characters per chunk
    for(let i=0, idx=0; i<txt.length; i+=approx, idx++){
      const chunk = txt.slice(i, i+approx);
      const title = `Chapter ${idx+1}`;
      chapters.push({ title, text: chunk.trim(), progress:0, quizTaken:false, score:0 });
    }
  }
  // clean empty chapters
  return chapters.filter(c => c.text && c.text.trim().length>30);
}

/* ====== Reading progress ====== */
chapterProgress.addEventListener('input', ()=>{
  if(!state.book) return;
  const idx = state.book.currentIndex || 0;
  state.book.chapters[idx].progress = Number(chapterProgress.value);
  saveState();
  refreshBookUI();
});

/* mark done */
markDoneBtn.addEventListener('click', ()=>{
  if(!state.book) return;
  const idx = state.book.currentIndex || 0;
  state.book.chapters[idx].progress = 100;
  saveState();
  refreshBookUI();
});

/* choose take quiz */
takeQuizBtn.addEventListener('click', ()=>{
  if(!state.book) return;
  const idx = state.book.currentIndex || 0;
  const ch = state.book.chapters[idx];
  openQuizForChapter(idx, ch);
});

/* ====== Quiz generation (simple, on-device algorithm) ======
   - For each chapter: extract sentences, pick up to 20 candidate sentences (long enough).
   - For each candidate, choose a word >4 chars and replace with blank as a question.
   - Provide 4 options: correct + 3 random distractor words from the chapter.
   - This is a heuristic generator meant for quick comprehension checks. It is not an AI.
*/
function splitToSentences(text){
  // simple sentence splitter (works for many texts)
  return text.match(/[^.!?]+[.!?]*/g) || [text];
}
function tokenizeWords(s){
  return s.match(/\b[A-Za-zÀ-ÖØ-öø-ÿ']{3,}\b/g) || [];
}
function pickRandom(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

function generateQuizFromChapter(chapter, maxQuestions=20){
  const sentences = splitToSentences(chapter.text).map(s => s.trim()).filter(s => s.length>40);
  const questions = [];
  const usedSent = new Set();
  const availableWords = tokenizeWords(chapter.text);
  for(let i=0; i<sentences.length && questions.length < maxQuestions; i++){
    const s = sentences[i];
    if(usedSent.has(s)) continue;
    const words = tokenizeWords(s);
    if(words.length === 0) continue;
    // choose a target word of reasonable length
    const candidates = words.filter(w=>w.length>4);
    if(candidates.length===0) continue;
    const answer = pickRandom(candidates);
    // make choices
    const distractors = [];
    // pick 3 random distinct words from availableWords not equal to answer
    let tries = 0;
    while(distractors.length < 3 && tries < 50){
      const w = pickRandom(availableWords);
      if(w && w.toLowerCase() !== answer.toLowerCase() && !distractors.includes(w)){
        distractors.push(w);
      }
      tries++;
    }
    if(distractors.length < 3) {
      // fill with substrings if not enough distinct words
      const filler = '______';
      while(distractors.length < 3) distractors.push(filler);
    }
    const choices = [answer, ...distractors].sort(()=>Math.random()-0.5);
    // question text: sentence with the answer replaced by "_____"
    const qtext = s.replace(new RegExp('\\b' + escapeRegExp(answer) + '\\b', 'i'), '_____');
    questions.push({ qtext, choices, answer });
    usedSent.add(s);
  }
  return questions;
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ====== Quiz UI ====== */
let currentQuiz = { idx:null, questions:[], answers:[] };
function openQuizForChapter(idx, ch){
  const q = generateQuizFromChapter(ch, 20);
  currentQuiz.idx = idx;
  currentQuiz.questions = q;
  currentQuiz.answers = new Array(q.length).fill(null);
  // render modal
  quizTitle.textContent = `Quiz — ${ch.title || 'Chapter'}`;
  quizArea.innerHTML = "";
  if(q.length === 0){
    quizArea.innerHTML = "<p class='muted small'>No suitable quiz questions could be created for this chapter. Try uploading a book with clear chapter headings or longer sentences.</p>";
  } else {
    q.forEach((ques,i)=>{
      const div = document.createElement('div');
      div.className = 'quiz-item';
      const qtext = document.createElement('div'); qtext.className = 'qtext'; qtext.textContent = `${i+1}. ${ques.qtext}`;
      div.appendChild(qtext);
      const opts = document.createElement('div');
      ques.choices.forEach(opt=>{
        const id = `q_${i}_${opt}`;
        const lbl = document.createElement('label');
        lbl.style.display='block';
        lbl.style.marginBottom='6px';
        const radio = document.createElement('input');
        radio.type='radio';
        radio.name = `q_${i}`;
        radio.value = opt;
        radio.onclick = ()=> currentQuiz.answers[i] = opt;
        lbl.appendChild(radio);
        lbl.appendChild(document.createTextNode(' ' + opt));
        opts.appendChild(lbl);
      });
      div.appendChild(opts);
      quizArea.appendChild(div);
    });
  }
  quizResult.textContent = "";
  quizModal.classList.remove('hidden');
}

closeQuiz.addEventListener('click', ()=>{ quizModal.classList.add('hidden'); });

submitQuiz.addEventListener('click', ()=>{
  if(!currentQuiz || !currentQuiz.questions) return;
  const total = currentQuiz.questions.length;
  let correct = 0;
  for(let i=0;i<total;i++){
    if(!currentQuiz.questions[i]) continue;
    const a = currentQuiz.answers[i];
    if(a && a.toLowerCase() === currentQuiz.questions[i].answer.toLowerCase()) correct++;
  }
  const score = total ? Math.round((correct/total)*100) : 0;
  quizResult.textContent = `You scored ${correct}/${total} (${score}%).`;
  // save quiz result on chapter
  const idx = currentQuiz.idx;
  if(state.book && state.book.chapters[idx]){
    state.book.chapters[idx].quizTaken = true;
    state.book.chapters[idx].score = score;
    saveState();
    refreshBookUI();
  }
});

/* ====== Final note & WhatsApp send ====== */
sendFinalBtn.addEventListener('click', ()=>{
  if(!state.member) { sendMsg.textContent = "Please create an account first."; return; }
  if(!state.book) { sendMsg.textContent = "Please upload and finish a book first."; return; }
  const allDone = state.book.chapters.every(c => c.progress >= 100);
  if(!allDone){ sendMsg.textContent = "You haven't completed all chapters yet. Finish all chapters before sending final note."; return; }
  const note = finalNote.value.trim();
  // Build a short WhatsApp message — NO book content or chapter text included
  const message = `LightUp Book Club — Completion Notice%0A` +
    `Member ID: ${encodeURIComponent(state.member.id)}%0A` +
    `Name: ${encodeURIComponent(state.member.name)}%0A` +
    `Book: ${encodeURIComponent(state.book.title)}%0A` +
    `Note: ${encodeURIComponent(note)}`;
  const waUrl = `https://wa.me/${ownerPhone}?text=${message}`;
  window.open(waUrl, '_blank');
  sendMsg.textContent = "WhatsApp opened with your final note. Please press SEND on WhatsApp to complete.";
});

/* ====== utilities to restore UI on load ====== */
(function init(){
  if(!state.member) state.member = null;
  // if there is a book but no currentIndex, set 0
  if(state.book && state.book.currentIndex===undefined) state.book.currentIndex = 0;
  refreshMemberUI();
  refreshBookUI();
})();

/* ====== Extra helpers ====== */
/* When user navigates chapters by clicking chapterList, selectChapter called earlier.
   Optionally, auto-save progress when scrolling in chapterText (not implemented to keep simple).
*/

/* ====== Limitations & Tips ======
 - The quiz generator is a heuristic: it turns sentences into cloze-style questions by blanking a word.
 - For better quizzes: upload text with clear chapter headings and longer meaningful sentences.
 - Uploaded books are stored in localStorage (some browsers may limit size). For large books, consider splitting or using a dedicated app.
*/
