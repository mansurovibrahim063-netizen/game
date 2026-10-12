// ====== Sozlamalar ======
const GRID_SIZE = 20;
const INITIAL_SPEED = 120;
const MIN_SPEED = 60;
const SPEED_STEP = 3;

// ====== DOM ======
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const viewBtn = document.getElementById('viewBtn');
const muteBtn = document.getElementById('muteBtn');
const resetRecordBtn = document.getElementById('resetRecordBtn');
const canvasContainer = document.getElementById('gameCanvas');

// ====== LocalStorage ======
const STORAGE_KEY = 'snakeHighScore';
const MUTE_KEY = 'snakeMuted';
const VIEW_KEY = 'snakeView';

// ====== O'yin holati ======
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let score = 0;
let highScore = 0;
let speed = INITIAL_SPEED;
let gameLoop = null;
let renderLoop = null;
let isRunning = false;
let isPaused = false;
let isGameOver = false;

// ====== 3D o'zgaruvchilar ======
let scene, camera, renderer;
let snakeMeshes = [];
let foodMesh = null;
let gridHelper = null;
let cameraMode = 'top';
let foodLight = null;

// ====== OVOZ TIZIMI ======
let audioCtx = null;
let isMuted = false;

function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('AudioContext qo\'llab-quvvatlanmaydi');
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, duration, type = 'sine', volume = 0.15, delay = 0, endFreq = null) {
    if (isMuted || !audioCtx) return;

    const now = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
}

// ====== Ovoz effektlari ======
function sfxEat() {
    playTone(880, 0.08, 'square', 0.12);
    playTone(1320, 0.1, 'square', 0.1, 0.05);
}
function sfxGameOver() {
    playTone(400, 0.15, 'sawtooth', 0.15, 0);
    playTone(300, 0.15, 'sawtooth', 0.15, 0.15);
    playTone(200, 0.4, 'sawtooth', 0.18, 0.3, 80);
}
function sfxNewRecord() {
    playTone(523.25, 0.12, 'triangle', 0.15, 0);
    playTone(659.25, 0.12, 'triangle', 0.15, 0.12);
    playTone(783.99, 0.12, 'triangle', 0.15, 0.24);
    playTone(1046.50, 0.3, 'triangle', 0.18, 0.36);
}
function sfxPause() { playTone(600, 0.08, 'sine', 0.1); }
function sfxResume() {
    playTone(500, 0.06, 'sine', 0.1);
    playTone(700, 0.08, 'sine', 0.1, 0.06);
}
function sfxStart() { playTone(300, 0.25, 'triangle', 0.12, 0, 800); }
function sfxTurn() { playTone(1200, 0.02, 'sine', 0.04); }

// ====== THREE.JS SAHNASINI SOZLASH ======
function initThree() {
    // Sahnani yaratish
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a15);
    scene.fog = new THREE.Fog(0x0a0a15, 25, 45);

    // Kamera
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);

    // ====== Yorug'lik ======
    const ambient = new THREE.AmbientLight(0x404060, 1);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 50;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x00ff87, 0.5, 20);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    foodLight = new THREE.PointLight(0xff3355, 0.6, 15);
    foodLight.position.set(0, 3, 0);
    scene.add(foodLight);

    // ====== Zamin ======
    const planeGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const planeMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        metalness: 0.3,
        roughness: 0.7
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(GRID_SIZE / 2 - 0.5, -0.5, GRID_SIZE / 2 - 0.5);
    plane.receiveShadow = true;
    scene.add(plane);

    // ====== Grid ======
    gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x00ff87, 0x224466);
    gridHelper.position.set(GRID_SIZE / 2 - 0.5, -0.49, GRID_SIZE / 2 - 0.5);
    scene.add(gridHelper);

    // ====== Devorlar ======
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x00ff87,
        emissive: 0x00ff87,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.35
    });
    const wallHeight = 0.4;
    const wallThickness = 0.15;

    const walls = [
        { geo: [GRID_SIZE + wallThickness, wallHeight, wallThickness], pos: [GRID_SIZE / 2 - 0.5, 0, -0.5] },
        { geo: [GRID_SIZE + wallThickness, wallHeight, wallThickness], pos: [GRID_SIZE / 2 - 0.5, 0, GRID_SIZE - 0.5] },
        { geo: [wallThickness, wallHeight, GRID_SIZE + wallThickness], pos: [-0.5, 0, GRID_SIZE / 2 - 0.5] },
        { geo: [wallThickness, wallHeight, GRID_SIZE + wallThickness], pos: [GRID_SIZE - 0.5, 0, GRID_SIZE / 2 - 0.5] }
    ];

    walls.forEach(w => {
        const geo = new THREE.BoxGeometry(...w.geo);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(...w.pos);
        scene.add(mesh);
    });

    // Kamera rejimini qo'llash
    applyCameraMode();

    // Resize
    window.addEventListener('resize', onResize);

    // Render loop
    startRenderLoop();
}

function startRenderLoop() {
    if (renderLoop) return;
    const animate = () => {
        renderLoop = requestAnimationFrame(animate);
        updateCameraAnimation();
        updateFoodAnimation();
        updateSnakeAnimation();
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    };
    animate();
}

// ====== Kamera rejimlari ======
function applyCameraMode() {
    if (cameraMode === 'top') {
        camera.position.set(GRID_SIZE / 2 - 0.5, 18, GRID_SIZE / 2 - 0.5);
        camera.lookAt(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);
        viewBtn.textContent = '📷 Ko\'rinish: Yuqori';
    } else {
        camera.position.set(-6, 14, GRID_SIZE + 4);
        camera.lookAt(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);
        viewBtn.textContent = '📷 Ko\'rinish: Izometrik';
    }
    camera.updateProjectionMatrix();
}

function updateCameraAnimation() {
    const targetPos = cameraMode === 'top'
        ? { x: GRID_SIZE / 2 - 0.5, y: 18, z: GRID_SIZE / 2 - 0.5 }
        : { x: -6, y: 14, z: GRID_SIZE + 4 };

    camera.position.x += (targetPos.x - camera.position.x) * 0.08;
    camera.position.y += (targetPos.y - camera.position.y) * 0.08;
    camera.position.z += (targetPos.z - camera.position.z) * 0.08;
    camera.lookAt(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);
}

function onResize() {
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    if (camera && renderer) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
}

// ====== Ilon segmenti mesh ======
function createSnakeSegmentMesh(isHead) {
    let geometry, material;

    if (isHead) {
        geometry = new THREE.BoxGeometry(0.85, 0.85, 0.85);
        material = new THREE.MeshStandardMaterial({
            color: 0x00ff87,
            emissive: 0x00aa55,
            emissiveIntensity: 0.4,
            metalness: 0.5,
            roughness: 0.3
        });
    } else {
        geometry = new THREE.BoxGeometry(0.75, 0.75, 0.75);
        material = new THREE.MeshStandardMaterial({
            color: 0x00cc66,
            emissive: 0x005533,
            emissiveIntensity: 0.2,
            metalness: 0.4,
            roughness: 0.4
        });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// ====== Ovqat mesh (3D shar) ======
function createFoodMesh() {
    const geo = new THREE.SphereGeometry(0.35, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xff3355,
        emissive: 0xff1144,
        emissiveIntensity: 0.7,
        metalness: 0.6,
        roughness: 0.2
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;

    const glowGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff3355,
        transparent: true,
        opacity: 0.15
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);

    const leafGeo = new THREE.ConeGeometry(0.1, 0.2, 8);
    const leafMat = new THREE.MeshStandardMaterial({
        color: 0x00ff87,
        emissive: 0x00aa55,
        emissiveIntensity: 0.5
    });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0.15, 0.4, 0);
    leaf.rotation.z = -Math.PI / 6;
    mesh.add(leaf);

    return mesh;
}

function updateFoodAnimation() {
    if (!foodMesh) return;
    const t = Date.now() / 400;
    foodMesh.rotation.y = t * 1.5;
    foodMesh.position.y = 0.4 + Math.sin(t * 2) * 0.1;
    const s = 1 + Math.sin(t * 3) * 0.08;
    foodMesh.scale.set(s, s, s);

    if (foodLight) {
        foodLight.position.x = foodMesh.position.x;
        foodLight.position.z = foodMesh.position.z;
        foodLight.intensity = 0.5 + Math.sin(t * 3) * 0.2;
    }
}

// ====== Iloncha animatsiyasi (pulsatsiya) ======
function updateSnakeAnimation() {
    const t = Date.now() / 300;
    snakeMeshes.forEach((mesh, i) => {
        if (i === 0) {
            // Bosh — sekin pulsatsiya
            const s = 1 + Math.sin(t) * 0.03;
            mesh.scale.set(s, s, s);
        } else {
            // Tana — segment bo'yicha siljish
            const offset = Math.sin(t + i * 0.5) * 0.03;
            mesh.position.y = offset;
        }
    });
}

// ====== Ilonchani 3D ga sinxronlash ======
function syncSnakeToScene() {
    // Eski mesh'larni o'chirish
    snakeMeshes.forEach(m => scene.remove(m));
    snakeMeshes = [];

    // Yangi mesh'lar
    snake.forEach((seg, i) => {
        const mesh = createSnakeSegmentMesh(i === 0);
        mesh.position.set(seg.x, 0, seg.y);
        if (i === 0) {
            if (direction.x === 1) mesh.rotation.y = Math.PI / 2;
            else if (direction.x === -1) mesh.rotation.y = -Math.PI / 2;
            else if (direction.y === -1) mesh.rotation.y = 0;
            else mesh.rotation.y = Math.PI;
        }
        scene.add(mesh);
        snakeMeshes.push(mesh);
    });

    if (snakeMeshes[0]) {
        addEyesToHead(snakeMeshes[0]);
    }
}

function addEyesToHead(headMesh) {
    const eyeGeo = new THREE.SphereGeometry(0.09, 10, 10);
    const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x111111
    });

    const forward = 0.42;
    const side = 0.22;
    const up = 0.15;

    let positions;
    if (direction.x === 1) {
        positions = [[forward, up, -side], [forward, up, side]];
    } else if (direction.x === -1) {
        positions = [[-forward, up, -side], [-forward, up, side]];
    } else if (direction.y === -1) {
        positions = [[-side, up, -forward], [side, up, -forward]];
    } else {
        positions = [[-side, up, forward], [side, up, forward]];
    }

    positions.forEach(p => {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(...p);
        headMesh.add(eye);
    });

    // Til
    const tongueGeo = new THREE.BoxGeometry(0.3, 0.04, 0.06);
    const tongueMat = new THREE.MeshStandardMaterial({
        color: 0xff3355,
        emissive: 0xff1144,
        emissiveIntensity: 0.8
    });
    const tongue = new THREE.Mesh(tongueGeo, tongueMat);
    if (direction.x === 1) tongue.position.set(0.55, -0.1, 0);
    else if (direction.x === -1) tongue.position.set(-0.55, -0.1, 0);
    else if (direction.y === -1) tongue.position.set(0, -0.1, -0.55);
    else tongue.position.set(0, -0.1, 0.55);
    headMesh.add(tongue);
}

// ====== Rekord ======
function loadHighScore() {
    const stored = localStorage.getItem(STORAGE_KEY);
    highScore = stored ? parseInt(stored, 10) : 0;
    if (isNaN(highScore)) highScore = 0;
    highScoreEl.textContent = highScore;
}

function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem(STORAGE_KEY, highScore);
        highScoreEl.textContent = highScore;
        return true;
    }
    return false;
}

function loadMuteSetting() {
    isMuted = localStorage.getItem(MUTE_KEY) === 'true';
    updateMuteBtn();
}

function updateMuteBtn() {
    muteBtn.textContent = isMuted ? '🔇 Ovoz: O\'chiq' : '🔊 Ovoz: Yoniq';
}

function loadViewSetting() {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'top' || stored === 'iso') {
        cameraMode = stored;
    }
}

// ====== O'yin boshlash ======
function startGame() {
    initAudio();
    sfxStart();

    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    speed = INITIAL_SPEED;
    scoreEl.textContent = '0';
    isGameOver = false;
    isPaused = false;
    isRunning = true;

    spawnFood();
    syncSnakeToScene();
    overlay.classList.add('hidden');
    pauseBtn.textContent = 'Pauza';

    clearInterval(gameLoop);
    gameLoop = setInterval(update, speed);
}

// ====== Pauza ======
function togglePause() {
    if (!isRunning || isGameOver) return;

    if (isPaused) {
        isPaused = false;
        pauseBtn.textContent = 'Pauza';
        overlay.classList.add('hidden');
        clearInterval(gameLoop);
        gameLoop = setInterval(update, speed);
        sfxResume();
    } else {
        isPaused = true;
        pauseBtn.textContent = 'Davom etish';
        clearInterval(gameLoop);
        showOverlay('Pauza', 'Davom etish uchun tugmani bosing');
        startBtn.textContent = 'Davom etish';
        sfxPause();
    }
}

// ====== O'yin tugadi ======
function endGame() {
    isRunning = false;
    isGameOver = true;
    clearInterval(gameLoop);

    const isNewRecord = saveHighScore();
    const title = isNewRecord ? '🏆 Yangi rekord!' : '💀 O\'yin tugadi';
    const text = isNewRecord
        ? `Ajoyib! Sizning natijangiz: ${score}. Yangi rekord o'rnatildi!`
        : `Sizning natijangiz: ${score}. Rekord: ${highScore}`;

    if (isNewRecord) sfxNewRecord();
    else sfxGameOver();

    showOverlay(title, text);
    startBtn.textContent = 'Qayta boshlash';
}

function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove('hidden');
}

// ====== Ovqat ======
function spawnFood() {
    const emptyCells = [];
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            if (!snake.some(s => s.x === x && s.y === y)) {
                emptyCells.push({ x, y });
            }
        }
    }
    if (emptyCells.length === 0) {
        endGame();
        return;
    }
    const rand = Math.floor(Math.random() * emptyCells.length);
    food = emptyCells[rand];

    if (foodMesh) scene.remove(foodMesh);
    foodMesh = createFoodMesh();
    foodMesh.position.set(food.x, 0.4, food.y);
    scene.add(foodMesh);
}

// ====== Yangilanish ======
function update() {
    if (!isRunning || isPaused) return;

    if (nextDirection.x !== -direction.x || nextDirection.y !== -direction.y) {
        direction = { ...nextDirection };
    }

    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
    };

    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        endGame();
        return;
    }

    const willEat = (head.x === food.x && head.y === food.y);
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);

    if (bodyToCheck.some(s => s.x === head.x && s.y === head.y)) {
        endGame();
        return;
    }

    snake.unshift(head);

    if (willEat) {
        score++;
        scoreEl.textContent = score;
        sfxEat();

        if (speed > MIN_SPEED) {
            speed = Math.max(MIN_SPEED, speed - SPEED_STEP);
            clearInterval(gameLoop);
            gameLoop = setInterval(update, speed);
        }
        spawnFood();
    } else {
        snake.pop();
    }

    syncSnakeToScene();
}

// ====== Klaviatura ======
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.code === 'Space') {
        e.preventDefault();
        if (!isRunning && !isGameOver) startGame();
        else if (isGameOver) startGame();
        else togglePause();
        return;
    }

    const keyMap = {
        'arrowup':    { x: 0, y: -1 },
        'w':          { x: 0, y: -1 },
        'arrowdown':  { x: 0, y: 1 },
        's':          { x: 0, y: 1 },
        'arrowleft':  { x: -1, y: 0 },
        'a':          { x: -1, y: 0 },
        'arrowright': { x: 1, y: 0 },
        'd':          { x: 1, y: 0 }
    };

    if (keyMap[key]) {
        e.preventDefault();
        const newDir = keyMap[key];
        if (newDir.x !== -direction.x || newDir.y !== -direction.y) {
            if (newDir.x !== direction.x || newDir.y !== direction.y) {
                sfxTurn();
            }
            nextDirection = newDir;
        }
    }
});

// ====== Tugmalar ======
startBtn.addEventListener('click', () => {
    initAudio();
    if (isPaused) togglePause();
    else startGame();
});

pauseBtn.addEventListener('click', togglePause);

restartBtn.addEventListener('click', () => {
    clearInterval(gameLoop);
    startGame();
});

viewBtn.addEventListener('click', () => {
    cameraMode = cameraMode === 'top' ? 'iso' : 'top';
    localStorage.setItem(VIEW_KEY, cameraMode);
    applyCameraMode();
    playTone(700, 0.08, 'sine', 0.08);
});

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem(MUTE_KEY, isMuted);
    updateMuteBtn();
    if (!isMuted) {
        initAudio();
        playTone(800, 0.08, 'sine', 0.12);
    }
});

resetRecordBtn.addEventListener('click', () => {
    if (confirm('Rekordni o\'chirishni xohlaysizmi?')) {
        localStorage.removeItem(STORAGE_KEY);
        highScore = 0;
        highScoreEl.textContent = '0';
    }
});

// ====== Boshlang'ich holat ======
function init() {
    loadHighScore();
    loadMuteSetting();
    loadViewSetting();

    // 3D sahnani yaratish
    initThree();

    // Boshlang'ich iloncha ko'rinishi (o'yin boshlanmasa ham ko'rinadi)
    snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];
    syncSnakeToScene();

    // Boshlang'ich ovqat
    food = { x: 15, y: 10 };
    foodMesh = createFoodMesh();
    foodMesh.position.set(food.x, 0.4, food.y);
    scene.add(foodMesh);
}

init();