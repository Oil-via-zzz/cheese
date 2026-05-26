// Game variables
let scene, camera, renderer;
let yawObject, pitchObject;
let player = { health: 100, ammo: 30 };
let inventory = { paws: 0, heads: 0, pelts: 0, wood: 0 };
let hasGun = false;
let hasAxe = false;
let wolves = [];
let zombies = [];
let bullets = [];
let items = [];
let trees = [];
let caves = [];
let keys = {};
let mouse = { x: 0, y: 0 };
let isPointerLocked = false;
let nearbyItem = null;
let nearbyTree = null;
let nearbyStone = null;
let activeSlot = 0;
let wolfTemplate = null;
let zombieTemplate = null;
let wolfAnimations = null;
let zombieAnimations = null;
let inventorySlots = [null, null, null, null];
let selectedSlot = 0;
let equippedItem = null;

function getSlotType(slot) {
    return slot ? slot.itemType : null;
}

function getSlotCount(slot) {
    return slot ? slot.count : 0;
}

function getItemCount(itemType) {
    return inventorySlots.reduce((sum, slot) => sum + ((slot && slot.itemType === itemType) ? slot.count : 0), 0);
}

function findStackableSlot(itemType) {
    return inventorySlots.find(slot => slot && slot.itemType === itemType && slot.count < 20);
}

function findEmptySlotIndex() {
    return inventorySlots.findIndex(slot => !slot);
}

function addItemToInventory(itemType, amount = 1) {
    let remaining = amount;
    let slot = findStackableSlot(itemType);
    while (slot && remaining > 0) {
        const canAdd = Math.min(20 - slot.count, remaining);
        slot.count += canAdd;
        remaining -= canAdd;
        slot = findStackableSlot(itemType);
    }

    while (remaining > 0) {
        const emptyIndex = findEmptySlotIndex();
        if (emptyIndex === -1) break;
        const count = Math.min(20, remaining);
        inventorySlots[emptyIndex] = { itemType, count };
        remaining -= count;
    }

    return remaining === 0;
}

function removeItemsFromInventory(itemType, amount) {
    let remaining = amount;
    for (let i = 0; i < inventorySlots.length; i++) {
        const slot = inventorySlots[i];
        if (slot && slot.itemType === itemType && remaining > 0) {
            const removed = Math.min(slot.count, remaining);
            slot.count -= removed;
            remaining -= removed;
            if (slot.count <= 0) {
                inventorySlots[i] = null;
            }
        }
    }
    return remaining === 0;
}

let tamedWolves = [];
let dayNightCycle = 0.3; // Start at morning (0.3 = morning, 0.5 = noon)
let dayCount = 0;
let nextRegrowthDay = 2;
let isNight = false;
let sun, moon, skySphere;
let ground;
let crosshair;
let playerCoins = 0;
let isPaused = false;
const clock = new THREE.Clock();

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);

    // Create FPS camera holder objects
    yawObject = new THREE.Object3D();
    pitchObject = new THREE.Object3D();
    pitchObject.rotation.order = 'YXZ';
    pitchObject.position.set(0, 0, 0);
    pitchObject.add(camera);
    yawObject.position.set(0, 1.6, 0); // eye height above ground
    yawObject.add(pitchObject);
    scene.add(yawObject);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 25);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 150;
    directionalLight.shadow.camera.left = -60;
    directionalLight.shadow.camera.right = 60;
    directionalLight.shadow.camera.top = 60;
    directionalLight.shadow.camera.bottom = -60;
    scene.add(directionalLight);

    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    directionalLight.target = ground;
    scene.add(directionalLight.target);

    // Create sun
    const sunGeometry = new THREE.SphereGeometry(2);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(60, 30, 0); // Start in morning position
    scene.add(sun);

    // Create moon
    const moonGeometry = new THREE.SphereGeometry(1.5);
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.set(-50, 30, 0); // Start on opposite side
    moon.visible = false; // Hide moon initially
    scene.add(moon);

    // Create sky sphere
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }); // Light blue, inside of sphere
    skySphere = new THREE.Mesh(skyGeometry, skyMaterial);
    skySphere.position.copy(camera.position); // Start at camera position
    scene.add(skySphere);

    // Create some trees/obstacles
    for (let i = 0; i < 20; i++) {
        createTree(Math.random() * 80 - 40, Math.random() * 80 - 40);
    }

    // Spawn stone nodes around the map for crafting resources
    for (let i = 0; i < 8; i++) {
        createStone(Math.random() * 80 - 40, Math.random() * 80 - 40);
    }

    // Spawn caves farther from spawn point
    for (let i = 0; i < 3; i++) {
        let x, z;
        do {
            x = Math.random() * 80 - 40;
            z = Math.random() * 80 - 40;
        } while (Math.sqrt(x * x + z * z) < 20); // Ensure at least 20 units from spawn
        createCave(x, z);
    }

    // Load wolf model and create wolves once ready
    const loader = new THREE.GLTFLoader();
    loader.load('wolf.glb', (gltf) => {
        console.log('Wolf model loaded successfully');
        wolfTemplate = gltf.scene;
        wolfAnimations = gltf.animations;
        console.log('Animations found:', wolfAnimations.length);

        wolfTemplate.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Raise the template so its lowest point sits at ground level
        const box = new THREE.Box3().setFromObject(wolfTemplate);
        wolfTemplate.position.y += -box.min.y;

        for (let i = 0; i < 5; i++) {
            createWolf(Math.random() * 60 - 30, Math.random() * 60 - 30);
        }
    }, (progress) => {
        console.log('Loading progress:', progress);
    }, (error) => {
        console.error('Failed to load wolf model:', error);
        console.log('Falling back to cube wolves');
        wolfTemplate = null;
        wolfAnimations = null;
        for (let i = 0; i < 5; i++) {
            createWolf(Math.random() * 60 - 30, Math.random() * 60 - 30);
        }
    });

    // Create zombies (only at night)
    if (isNight) {
        for (let i = 0; i < 3; i++) {
            createZombie(Math.random() * 60 - 30, Math.random() * 60 - 30);
        }
    }

    // Add crosshair
    crosshair = document.createElement('div');
    crosshair.className = 'crosshair';

    // Add health bar to crosshair
    const healthBar = document.createElement('div');
    healthBar.id = 'crosshair-health-bar';
    healthBar.style.display = 'none';
    healthBar.style.position = 'absolute';
    healthBar.style.bottom = '-30px';
    healthBar.style.left = '50%';
    healthBar.style.transform = 'translateX(-50%)';
    healthBar.style.width = '60px';
    healthBar.style.height = '8px';
    healthBar.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
    healthBar.style.border = '1px solid white';

    const healthFill = document.createElement('div');
    healthFill.id = 'crosshair-health-fill';
    healthFill.style.height = '100%';
    healthFill.style.backgroundColor = 'red';
    healthFill.style.width = '100%';
    healthBar.appendChild(healthFill);

    crosshair.appendChild(healthBar);
    document.body.appendChild(crosshair);

    // Event listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (event) => {
        if (event.code === 'KeyQ') {
            onPunch();
            event.preventDefault();
        }
    });
    document.addEventListener('pointerlockchange', onPointerLockChange);

    window.addEventListener('resize', onWindowResize);

    // Start game loop
    animate();
    updateUI(); // Initial UI draw
}

// Create a simple tree
function createTree(x, z) {
    const treeGroup = new THREE.Group();
    
    const radius = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
    const health = Math.floor(170 * (radius / 0.5)); // Scale health with radius
    const trunkGeometry = new THREE.CylinderGeometry(radius, radius, 2);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(0, 1, 0);
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const leavesGeometry = new THREE.SphereGeometry(1.5);
    const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.set(0, 3, 0);
    leaves.castShadow = true;
    treeGroup.add(leaves);

    treeGroup.position.set(x, 0, z);
    treeGroup.userData = { type: 'tree', health: health, radius: radius };
    scene.add(treeGroup);
    trees.push({ x, z, radius: radius, mesh: treeGroup }); // Store mesh for removal
}

function createStone(x, z) {
    const stoneGroup = new THREE.Group();
    const stoneRock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.6),
        new THREE.MeshLambertMaterial({ color: 0x808080 })
    );
    stoneRock.castShadow = true;
    stoneGroup.add(stoneRock);
    stoneGroup.position.set(x, 0.3, z);
    stoneGroup.userData = { type: 'stone_node', health: 50 };
    scene.add(stoneGroup);
    items.push(stoneGroup);
}

function createCave(x, z) {
    const caveGroup = new THREE.Group();
    
    // Cave entrance - dark hole
    const entranceGeometry = new THREE.CylinderGeometry(1.5, 1.5, 0.5, 16);
    const entranceMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(0, 0.25, 0);
    entrance.castShadow = false;
    caveGroup.add(entrance);

    // Cave rocks around entrance
    for (let i = 0; i < 5; i++) {
        const rockGeometry = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.4);
        const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x696969 });
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        rock.position.set(
            (Math.random() - 0.5) * 3,
            Math.random() * 0.5,
            (Math.random() - 0.5) * 3
        );
        rock.castShadow = true;
        caveGroup.add(rock);
    }

    caveGroup.position.set(x, 0, z);
    caveGroup.userData = { type: 'cave' };
    scene.add(caveGroup);
    caves.push(caveGroup);
}

function createWolf(x, z) {
    let wolf;

    if (wolfTemplate) {
        wolf = THREE.SkeletonUtils.clone(wolfTemplate);
        wolf.position.set(x, 0, z);
    } else {
        // Create a detailed wolf-like model with better proportions
        wolf = new THREE.Group();

        // Main body (torso) - using CylinderGeometry instead of CapsuleGeometry
        const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.set(0, 0.6, 0);
        body.castShadow = true;
        wolf.add(body);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.35, 8, 6);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.set(0, 0.9, 0.8);
        head.scale.set(1, 0.8, 1.2);
        head.castShadow = true;
        wolf.add(head);

        // Snout
        const snoutGeometry = new THREE.ConeGeometry(0.15, 0.4, 6);
        const snoutMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
        const snout = new THREE.Mesh(snoutGeometry, snoutMaterial);
        snout.position.set(0, 0.75, 1.1);
        snout.rotation.x = -Math.PI / 6;
        snout.castShadow = true;
        wolf.add(snout);

        // Ears
        const earGeometry = new THREE.ConeGeometry(0.08, 0.3, 4);
        const earMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(-0.2, 1.1, 0.6);
        leftEar.castShadow = true;
        wolf.add(leftEar);

        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.2, 1.1, 0.6);
        rightEar.castShadow = true;
        wolf.add(rightEar);

        // Legs (4 legs)
        const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.6);
        const legMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });

        const legPositions = [
            [-0.25, 0.3, 0.4],  // Front left
            [0.25, 0.3, 0.4],   // Front right
            [-0.25, 0.3, -0.4], // Back left
            [0.25, 0.3, -0.4]   // Back right
        ];

        legPositions.forEach((pos, index) => {
            const leg = new THREE.Mesh(legGeometry, legMaterial);
            leg.position.set(pos[0], pos[1], pos[2]);
            leg.castShadow = true;
            wolf.add(leg);
        });

        // Tail
        const tailGeometry = new THREE.CylinderGeometry(0.06, 0.03, 0.8);
        const tailMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(0, 0.7, -0.8);
        tail.rotation.z = Math.PI / 3;
        tail.castShadow = true;
        wolf.add(tail);

        wolf.position.set(x, 0, z);
    }

    wolf.castShadow = true;
    wolf.userData = {
        type: 'wolf',
        health: 20,
        aggressive: false,
        direction: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        speed: 0.02 + Math.random() * 0.02,
        changeDirectionTimer: 0,
        mixer: null,
        animationTime: 0
    };

    if (wolfAnimations && wolfAnimations.length > 0) {
        const mixer = new THREE.AnimationMixer(wolf);
        const action = mixer.clipAction(wolfAnimations[0]);
        action.play();
        wolf.userData.mixer = mixer;
    }

    scene.add(wolf);
    wolves.push(wolf);
}

function createZombie(x, z) {
    const zombie = new THREE.Group();

    // Main body (torso) - using CylinderGeometry instead of CapsuleGeometry
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0.6, 0);
    body.castShadow = true;
    zombie.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.35, 8, 6);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0x1a3310 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0.9, 0.8);
    head.scale.set(1, 0.8, 1.2);
    head.castShadow = true;
    zombie.add(head);

    // Arms (zombie-like)
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.8);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.5, 0.6, 0.2);
    leftArm.rotation.z = Math.PI / 4;
    leftArm.castShadow = true;
    zombie.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.5, 0.6, 0.2);
    rightArm.rotation.z = -Math.PI / 4;
    rightArm.castShadow = true;
    zombie.add(rightArm);

    // Legs (4 legs)
    const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.6);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x1a3310 });

    const legPositions = [
        [-0.25, 0.3, 0.4],  // Front left
        [0.25, 0.3, 0.4],   // Front right
        [-0.25, 0.3, -0.4], // Back left
        [0.25, 0.3, -0.4]   // Back right
    ];

    legPositions.forEach((pos, index) => {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(pos[0], pos[1], pos[2]);
        leg.castShadow = true;
        zombie.add(leg);
    });

    zombie.position.set(x, 0, z);
    zombie.castShadow = true;
    zombie.userData = {
        type: 'zombie',
        health: 5,
        direction: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        speed: 0.015 + Math.random() * 0.01,
        changeDirectionTimer: 0
    };

    scene.add(zombie);
    zombies.push(zombie);
}

// Create item drop
function createItem(x, z, type) {
    let item;
    if (type === 'axe') {
        item = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.4), new THREE.MeshLambertMaterial({ color: 0x777777 }));
        head.position.y = 0.3;
        item.add(handle, head);
        item.rotation.x = Math.PI / 2;
    } else if (type === 'gun') {
        item = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        grip.position.set(0, -0.15, -0.2);
        item.add(barrel, grip);
    } else if (type === 'stone') {
        const stoneGeometry = new THREE.DodecahedronGeometry(0.3);
        const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
        item = new THREE.Mesh(stoneGeometry, stoneMaterial);
    } else {
        const itemGeometry = new THREE.SphereGeometry(0.2);
        let color;
        switch (type) {
            case 'paw': color = 0x8B4513; break;
            case 'head': color = 0xFF0000; break;
            case 'pelt': color = 0xFFFF00; break;
            case 'wood': color = 0x8B4513; break;
            default: color = 0xFFFFFF;
        }
        const itemMaterial = new THREE.MeshLambertMaterial({ color: color });
        item = new THREE.Mesh(itemGeometry, itemMaterial);
    }

    item.position.set(x, 0.2, z);
    item.userData = { type: 'item', itemType: type };
    scene.add(item);
    items.push(item);
}

// Handle keyboard input
function onKeyDown(event) {
    keys[event.code] = true;

    // Hotbar selection (Keys 1-4)
    if (event.code === 'Digit1') { selectedSlot = 0; updateUI(); }
    if (event.code === 'Digit2') { selectedSlot = 1; updateUI(); }
    if (event.code === 'Digit3') { selectedSlot = 2; updateUI(); }
    if (event.code === 'Digit4') { selectedSlot = 3; updateUI(); }

    // Equip selected item
    if (event.code === 'KeyQ') {
        equippedItem = inventorySlots[selectedSlot] ? inventorySlots[selectedSlot].itemType : null;
        updateUI();
    }

    // Crafting (C key)
    if (event.code === 'KeyC') {
        openCraftingMenu();
    }

    // Tame wolf (T key when near wolf)
    if (event.code === 'KeyT') {
        tameNearbyWolf();
    }

    // Toggle pause menu with Tab during gameplay
    if (event.code === 'Tab') {
        event.preventDefault();
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer || gameContainer.style.display !== 'block') {
            return;
        }
        if (!isPaused) {
            openPauseMenu();
        } else {
            closePauseMenu(true);
        }
        return;
    }

    // Exit pointer lock (Escape key)
    if (event.code === 'Escape') {
        document.exitPointerLock();
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

// Handle mouse movement
function onMouseMove(event) {
    if (!isPointerLocked) return;

    const sensitivity = 0.002;
    yawObject.rotation.y -= event.movementX * sensitivity;
    pitchObject.rotation.x -= event.movementY * sensitivity;
    pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
}

// Handle mouse click (shooting)
function onClick(event) {
    if (!isPointerLocked) {
        const canvas = document.getElementById('game-canvas');
        if (event.target === canvas && canvas && canvas.requestPointerLock) {
            try {
                const lockPromise = canvas.requestPointerLock();
                if (lockPromise && typeof lockPromise.catch === 'function') {
                    lockPromise.catch((error) => {
                        console.warn('Pointer lock failed:', error);
                    });
                }
            } catch (error) {
                console.warn('Pointer lock failed:', error);
            }
        }
        return;
    }

    if (player.ammo > 0 && equippedItem === 'gun') {
        player.ammo--;
        updateUI();

        // Create visible bullet
        const bulletGeometry = new THREE.SphereGeometry(0.05);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

        // Position bullet at camera position
        bullet.position.copy(camera.position);

        // Get direction from camera
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.normalize();

        bullet.userData = {
            type: 'bullet',
            direction: direction.clone(),
            speed: 1.0,
            life: 0,
            maxLife: 100 // frames before disappearing
        };

        scene.add(bullet);
        bullets.push(bullet);

        // Raycast from camera for immediate hit detection
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        const intersects = raycaster.intersectObjects(wolves.concat(zombies), true);

        if (intersects.length > 0) {
            let hitEnemy = intersects[0].object;
            while (hitEnemy && !hitEnemy.userData.type) {
                hitEnemy = hitEnemy.parent;
            }
            if (hitEnemy && (hitEnemy.userData.type === 'wolf' || hitEnemy.userData.type === 'zombie')) {
                const damage = 1; // Gun damage
                hitEnemy.userData.health -= damage;

                // Show damage
                const damageDisplay = document.getElementById('damage-display');
                damageDisplay.textContent = `-${damage} HP`;
                damageDisplay.style.display = 'block';
                setTimeout(() => {
                    damageDisplay.style.display = 'none';
                }, 1000);

                if (hitEnemy.userData.health <= 0) {
                    // Kill enemy and drop items
                    if (hitEnemy.userData.type === 'wolf') {
                        const index = wolves.indexOf(hitEnemy);
                        if (index > -1) wolves.splice(index, 1);
                    } else {
                        const index = zombies.indexOf(hitEnemy);
                        if (index > -1) zombies.splice(index, 1);
                    }
                    scene.remove(hitEnemy);

                    // Drop random items
                    const dropX = hitEnemy.position.x + (Math.random() - 0.5) * 2;
                    const dropZ = hitEnemy.position.z + (Math.random() - 0.5) * 2;

                    if (hitEnemy.userData.type === 'wolf') {
                        const drops = ['paw', 'head', 'pelt'];
                        for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
                            createItem(dropX, dropZ, drops[Math.floor(Math.random() * drops.length)]);
                        }
                    }
                }
            }
        }
    } else if (equippedItem === 'axe') {
        // Axe attack - check for trees or enemies in front
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        raycaster.far = 10; // Axe range

        // Get all tree meshes (trunk and leaves) and enemy meshes
        const allTreeMeshes = [];
        trees.forEach(tree => {
            tree.mesh.traverse((child) => {
                if (child.isMesh) {
                    allTreeMeshes.push(child);
                }
            });
        });

        const intersects = raycaster.intersectObjects(allTreeMeshes.concat(wolves).concat(zombies), true);

        if (intersects.length > 0) {
            let hitObject = intersects[0].object;

            // Find the root object with userData
            let target = hitObject;
            while (target && target.parent && !target.userData.type) {
                target = target.parent;
            }

            if (target && target.userData.type === 'tree') {
                // Chop tree
                const damage = 34; // Axe damage on trees
                target.userData.health -= damage;

                // Show damage
                const damageDisplay = document.getElementById('damage-display');
                damageDisplay.textContent = `-${damage} HP`;
                damageDisplay.style.display = 'block';
                setTimeout(() => {
                    damageDisplay.style.display = 'none';
                }, 1000);

                if (target.userData.health <= 0) {
                    const treeIndex = trees.findIndex(t => t.mesh === target);
                    if (treeIndex > -1) {
                        const tree = trees[treeIndex];
                        scene.remove(tree.mesh);
                        trees.splice(treeIndex, 1);

                        // Drop wood
                        const woodCount = 2 + Math.floor((tree.radius - 0.3) / 0.4 * 3);
                        for (let i = 0; i < woodCount; i++) {
                            createItem(tree.x + (Math.random() - 0.5) * 2, tree.z + (Math.random() - 0.5) * 2, 'wood');
                        }
                    }
                }
            } else if (target && (target.userData.type === 'wolf' || target.userData.type === 'zombie')) {
                // Attack enemy with axe
                const damage = 2; // Axe damage
                target.userData.health -= damage;

                // Show damage
                const damageDisplay = document.getElementById('damage-display');
                damageDisplay.textContent = `-${damage} HP`;
                damageDisplay.style.display = 'block';
                setTimeout(() => {
                    damageDisplay.style.display = 'none';
                }, 1000);

                if (target.userData.health <= 0) {
                    // Kill enemy and drop items
                    if (target.userData.type === 'wolf') {
                        const index = wolves.indexOf(target);
                        if (index > -1) wolves.splice(index, 1);
                    } else {
                        const index = zombies.indexOf(target);
                        if (index > -1) zombies.splice(index, 1);
                    }
                    scene.remove(target);

                    // Drop random items
                    const dropX = target.position.x + (Math.random() - 0.5) * 2;
                    const dropZ = target.position.z + (Math.random() - 0.5) * 2;

                    if (target.userData.type === 'wolf') {
                        const drops = ['paw', 'head', 'pelt'];
                        for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
                            createItem(dropX, dropZ, drops[Math.floor(Math.random() * drops.length)]);
                        }
                    }
                }
            }
        }
    } else if (equippedItem === 'health_potion') {
        // Use health potion
        player.health = Math.min(100, player.health + 50);
        inventorySlots[selectedSlot] = null; // Remove used item
        equippedItem = null;
        updateUI();
        alert('Used Health Potion! Health restored.');
    } else if (equippedItem === 'speed_elixir') {
        // Use speed elixir (temporary speed boost)
        player.speed *= 2;
        setTimeout(() => {
            player.speed /= 2; // Reset speed after 30 seconds
        }, 30000);
        inventorySlots[selectedSlot] = null; // Remove used item
        equippedItem = null;
        updateUI();
        alert('Used Speed Elixir! Movement speed doubled for 30 seconds.');
    }
}

function onPunch() {
    if (isPaused || !isPointerLocked) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 10;

    const treeMeshes = [];
    trees.forEach(tree => {
        tree.mesh.traverse((child) => {
            if (child.isMesh) treeMeshes.push(child);
        });
    });

    const stoneNodes = items.filter(item => item.userData && item.userData.type === 'stone_node');
    const intersects = raycaster.intersectObjects(treeMeshes.concat(stoneNodes), true);

    if (intersects.length === 0) return;

    let hit = intersects[0].object;
    while (hit && !hit.userData.type && hit.parent) {
        hit = hit.parent;
    }

    if (hit && hit.userData.type === 'tree') {
        const damage = equippedItem === 'axe' ? 55 : 25;
        hit.userData.health -= damage;
        const damageDisplay = document.getElementById('damage-display');
        damageDisplay.textContent = `-${damage} HP`;
        damageDisplay.style.display = 'block';
        setTimeout(() => {
            damageDisplay.style.display = 'none';
        }, 1000);

        if (hit.userData.health <= 0) {
            const treeIndex = trees.findIndex(t => t.mesh === hit);
            if (treeIndex > -1) {
                const tree = trees[treeIndex];
                scene.remove(tree.mesh);
                trees.splice(treeIndex, 1);
                const woodCount = 2 + Math.floor((tree.radius - 0.3) / 0.4 * 3); // 2 to 5 wood
                for (let i = 0; i < woodCount; i++) {
                    createItem(tree.x + (Math.random() - 0.5) * 2, tree.z + (Math.random() - 0.5) * 2, 'wood');
                }
                updateUI();
            }
        }
    } else if (hit && hit.userData.type === 'stone_node') {
        if (equippedItem === 'pickaxe') {
            const damage = 20;
            hit.userData.health -= damage;
            const damageDisplay = document.getElementById('damage-display');
            damageDisplay.textContent = `-${damage} HP`;
            damageDisplay.style.display = 'block';
            setTimeout(() => {
                damageDisplay.style.display = 'none';
            }, 1000);

            if (hit.userData.health <= 0) {
                const stoneNode = hit;
                scene.remove(stoneNode);
                const itemIndex = items.indexOf(stoneNode);
                if (itemIndex > -1) items.splice(itemIndex, 1);

                const dropCount = 1 + Math.floor(Math.random() * 2);
                for (let i = 0; i < dropCount; i++) {
                    createItem(stoneNode.position.x + (Math.random() - 0.5) * 2, stoneNode.position.z + (Math.random() - 0.5) * 2, 'stone');
                }
                updateUI();
            }
        } else {
            const damageDisplay = document.getElementById('damage-display');
            damageDisplay.textContent = 'Need a pickaxe to mine stone.';
            damageDisplay.style.color = 'red';
            damageDisplay.style.display = 'block';
            setTimeout(() => {
                damageDisplay.style.display = 'none';
                damageDisplay.style.color = 'red';
            }, 1500);
        }
    } else if (hit && hit.userData.type === 'wolf') {
        const damage = equippedItem === 'axe' ? 18 : 10; // Axe should hurt more than a fist
        hit.userData.health -= damage;
        hit.userData.aggressive = true; // Make wolf aggressive

        // Show damage
        const damageDisplay = document.getElementById('damage-display');
        damageDisplay.textContent = `-${damage} HP`;
        damageDisplay.style.display = 'block';
        setTimeout(() => {
            damageDisplay.style.display = 'none';
        }, 1000);

        if (hit.userData.health <= 0) {
            // Kill wolf
            const index = wolves.indexOf(hit);
            if (index > -1) wolves.splice(index, 1);
            scene.remove(hit);

            // Drop items
            const drops = ['paw', 'head', 'pelt'];
            for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
                createItem(hit.position.x + (Math.random() - 0.5) * 2, hit.position.z + (Math.random() - 0.5) * 2, drops[Math.floor(Math.random() * drops.length)]);
            }
        }
    }
}

// Handle pointer lock changes
function onPointerLockChange() {
    const canvas = document.getElementById('game-canvas');
    isPointerLocked = document.pointerLockElement === canvas;
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update UI
function tameNearbyWolf() {
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);

    let nearestWolf = null;
    let nearestDistance = 3; // Taming range

    wolves.forEach(wolf => {
        const distance = cameraWorldPos.distanceTo(wolf.position);
        if (distance < nearestDistance) {
            nearestWolf = wolf;
            nearestDistance = distance;
        }
    });

    if (nearestWolf) {
        // Remove from wild wolves and add to tamed wolves
        const index = wolves.indexOf(nearestWolf);
        if (index > -1) wolves.splice(index, 1);
        tamedWolves.push(nearestWolf);
        nearestWolf.userData.type = 'tamed_wolf';
    }
}

function craftItem() {
    const woodCount = getItemCount('wood');
    const stoneCount = getItemCount('stone');

    if (woodCount >= 2 && stoneCount >= 2 && !inventorySlots.some(slot => slot && slot.itemType === 'axe')) {
        removeItemsFromInventory('wood', 2);
        removeItemsFromInventory('stone', 2);
        addItemToInventory('axe', 1);
        updateUI();
        alert('Crafted an axe from wood and stone!');
        return;
    }

    if (woodCount >= 1 && stoneCount >= 3 && !inventorySlots.some(slot => slot && slot.itemType === 'gun')) {
        removeItemsFromInventory('wood', 1);
        removeItemsFromInventory('stone', 3);
        addItemToInventory('gun', 1);
        updateUI();
        alert('Crafted a gun from wood and stone!');
        return;
    }

    if (inventorySlots.some(slot => slot && (slot.itemType === 'axe' || slot.itemType === 'gun'))) {
        alert('You already have the tool to craft.');
        return;
    }

    alert('Need more wood and stone to craft a tool.');
}

function updateUI() {
    document.getElementById('health').textContent = `Health: ${player.health}`;
    document.getElementById('ammo').textContent = `Ammo: ${player.ammo}`;
    document.getElementById('coins').textContent = `Coins: ${playerCoins}`;

    // Update time of day display
    let timeDisplay;
    let timeColor;
    if (isNight) {
        timeDisplay = '🌙 Night';
        timeColor = '#ffff00';
    } else if (dayNightCycle >= 0.65 && dayNightCycle < 0.75) {
        timeDisplay = '🌅 Sunset';
        timeColor = '#ff8c00'; // Orange color for sunset
    } else {
        timeDisplay = '☀️ Day';
        timeColor = '#ffffff';
    }
    document.getElementById('time-display').textContent = timeDisplay;
    document.getElementById('time-display').style.color = timeColor;

    // Update inventory slots
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (slot) {
            let content = `${i + 1}`;
            if (inventorySlots[i]) {
                const itemType = inventorySlots[i].itemType;
                const itemCount = inventorySlots[i].count;
                switch (itemType) {
                    case 'gun': content += '<br>🔫'; break;
                    case 'axe': content += '<br>🪓'; break;
                    case 'paw': content += '<br>🐾'; break;
                    case 'head': content += '<br>💀'; break;
                    case 'pelt': content += '<br>🐺'; break;
                    case 'wood': content += '<br>🪵'; break;
                    case 'stone': content += '<br>🪨'; break;
                    case 'pickaxe': content += '<br>⛏️'; break;
                    case 'crystal_ore': content += '<br>💎'; break;
                    case 'enchanted_pickaxe': content += '<br>⛏️'; break;
                    case 'health_potion': content += '<br>🧪'; break;
                    case 'speed_elixir': content += '<br>⚡'; break;
                    case 'rare_spice': content += '<br>🌶️'; break;
                    case 'sand_boots': content += '<br>🥾'; break;
                }
                if (itemCount > 1) {
                    content += `<br>${itemCount}`;
                }
            }
            slot.innerHTML = content;

            if (i === selectedSlot) {
                slot.classList.add('selected');
            } else {
                slot.classList.remove('selected');
            }
        }
    }

    // Update equipped item display
    const equippedDiv = document.getElementById('equipped-item');
    if (equippedItem) {
        let emoji = '';
        switch (equippedItem) {
            case 'gun': emoji = '🔫'; break;
            case 'axe': emoji = '🪓'; break;
            case 'pickaxe': emoji = '⛏️'; break;
            case 'paw': emoji = '🐾'; break;
            case 'head': emoji = '💀'; break;
            case 'pelt': emoji = '🐺'; break;
            case 'wood': emoji = '🪵'; break;
            case 'stone': emoji = '🪨'; break;
            case 'crystal_ore': emoji = '💎'; break;
            case 'enchanted_pickaxe': emoji = '⛏️'; break;
            case 'health_potion': emoji = '🧪'; break;
            case 'speed_elixir': emoji = '⚡'; break;
            case 'rare_spice': emoji = '🌶️'; break;
            case 'sand_boots': emoji = '🥾'; break;
        }
        equippedDiv.textContent = emoji;
    } else {
        equippedDiv.textContent = '';
    }

    // Show punch/mine prompt
    const punchPrompt = document.getElementById('punch-prompt');
    if (nearbyTree || nearbyStone) {
        punchPrompt.textContent = 'Press Q to punch/mine';
        punchPrompt.style.display = 'block';
    } else {
        punchPrompt.style.display = 'none';
    }

    // Show pickup prompt
    const pickupPrompt = document.getElementById('pickup-prompt');
    if (nearbyItem) {
        const itemName = nearbyItem.userData.itemType.charAt(0).toUpperCase() + nearbyItem.userData.itemType.slice(1);
        pickupPrompt.textContent = `Press E to pick up ${itemName}`;
        pickupPrompt.style.display = 'block';
    } else {
        pickupPrompt.style.display = 'none';
    }
}

// Game loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (isPaused) {
        renderer.render(scene, camera);
        return;
    }

    // Update day/night cycle (slower for longer days/nights)
    dayNightCycle += delta * 0.005; // Much slower cycle (was 0.02)
    if (dayNightCycle >= 1) dayNightCycle = 0;

    // Determine if it's night (cycle 0.75-1.0 and 0.0-0.25)
    const wasNight = isNight;
    isNight = dayNightCycle > 0.75 || dayNightCycle < 0.25;

    // Update sky color based on time of day
    if (skySphere && skySphere.material) {
        let skyColor;
        if (dayNightCycle < 0.25) {
            // Late night to early morning: dark navy blue
            skyColor = 0x000033;
        } else if (dayNightCycle < 0.35) {
            // Early morning: transition to light blue
            const t = (dayNightCycle - 0.25) / 0.1;
            skyColor = new THREE.Color(0x000033).lerp(new THREE.Color(0x87CEEB), t).getHex();
        } else if (dayNightCycle < 0.65) {
            // Morning to afternoon: light blue
            skyColor = 0x87CEEB;
        } else if (dayNightCycle < 0.75) {
            // Late afternoon to sunset: transition to yellow/orange
            const t = (dayNightCycle - 0.65) / 0.1;
            skyColor = new THREE.Color(0x87CEEB).lerp(new THREE.Color(0xFFA500), t).getHex();
        } else {
            // Sunset to night: transition to dark navy
            const t = (dayNightCycle - 0.75) / 0.25;
            skyColor = new THREE.Color(0xFFA500).lerp(new THREE.Color(0x000033), t).getHex();
        }
        skySphere.material.color.setHex(skyColor);
    }

    // Update lighting based on time of day
    const directionalLight = scene.children.find(child => child.type === 'DirectionalLight');
    if (directionalLight) {
        // Calculate light intensity (brighter during day, dimmer at night)
        const lightIntensity = isNight ? 0.2 : 1.0; // Even dimmer at night
        directionalLight.intensity = lightIntensity;

        // Position sun/moon based on cycle
        const sunAngle = dayNightCycle * Math.PI * 2;
        directionalLight.position.set(
            Math.cos(sunAngle) * 50,
            Math.sin(sunAngle) * 50,
            0
        );

        // Move sun and moon
        if (sun) {
            sun.position.set(
                Math.cos(sunAngle) * 60,
                Math.max(Math.sin(sunAngle) * 40, -10), // Keep sun above horizon
                0
            );
            sun.visible = dayNightCycle >= 0.25 && dayNightCycle <= 0.75; // Show sun during day
        }

        if (moon) {
            const moonAngle = sunAngle + Math.PI; // Opposite side of sun
            moon.position.set(
                Math.cos(moonAngle) * 50,
                Math.max(Math.sin(moonAngle) * 35, -5), // Keep moon above horizon
                0
            );
            moon.visible = isNight; // Show moon only at night
        }

        // Change ground color based on time of day
        if (ground && ground.material) {
            const dayColor = 0x228B22; // Green grass
            const nightColor = 0x0a2a0a; // Dark green
            const t = isNight ? 0.3 : 1.0; // Transition factor
            const r = Math.round(((dayColor >> 16) & 0xff) * t + ((nightColor >> 16) & 0xff) * (1 - t));
            const g = Math.round(((dayColor >> 8) & 0xff) * t + ((nightColor >> 8) & 0xff) * (1 - t));
            const b = Math.round((dayColor & 0xff) * t + (nightColor & 0xff) * (1 - t));
            ground.material.color.setRGB(r / 255, g / 255, b / 255);
        }
    }

    // Spawn/despawn zombies based on day/night
    if (!wasNight && isNight) {
        // Night just started - spawn zombies
        for (let i = 0; i < 5; i++) {
            createZombie(Math.random() * 60 - 30, Math.random() * 60 - 30);
        }
    } else if (wasNight && !isNight) {
        // Day just started - remove all zombies
        zombies.forEach(zombie => {
            scene.remove(zombie);
        });
        zombies = [];

        // Count a new day and regrow resources every 2 days
        dayCount++;
        if (dayCount >= nextRegrowthDay) {
            nextRegrowthDay += 2;
            for (let i = 0; i < 6; i++) {
                createTree(Math.random() * 80 - 40, Math.random() * 80 - 40);
            }
            for (let i = 0; i < 4; i++) {
                createStone(Math.random() * 80 - 40, Math.random() * 80 - 40);
            }
        }
    }

    // Handle movement
    const speed = 0.1;
    const direction = new THREE.Vector3();

    if (keys['KeyW'] || keys['ArrowUp']) direction.z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) direction.z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) direction.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) direction.x += 1;

    if (direction.length() > 0) {
        direction.normalize();
        const moveDir = direction.clone().applyEuler(new THREE.Euler(0, yawObject.rotation.y, 0));
        const nextPos = yawObject.position.clone().add(moveDir.multiplyScalar(speed));

        // Simple collision detection with trees and stones
        let canMove = true;
        for (let tree of trees) {
            const dist = Math.sqrt(Math.pow(nextPos.x - tree.x, 2) + Math.pow(nextPos.z - tree.z, 2));
            if (dist < tree.radius + 0.5) { // 0.5 is player radius
                canMove = false;
                break;
            }
        }
        if (canMove) {
            for (let item of items) {
                if (item.userData && item.userData.type === 'stone_node') {
                    const dist = Math.sqrt(Math.pow(nextPos.x - item.position.x, 2) + Math.pow(nextPos.z - item.position.z, 2));
                    if (dist < 0.6 + 0.5) { // stone radius ~0.6
                        canMove = false;
                        break;
                    }
                }
            }
        }

        if (canMove) {
            yawObject.position.copy(nextPos);
            
            // World wrapping (toroidal world)
            const worldSize = 100;
            if (yawObject.position.x > worldSize / 2) yawObject.position.x -= worldSize;
            if (yawObject.position.x < -worldSize / 2) yawObject.position.x += worldSize;
            if (yawObject.position.z > worldSize / 2) yawObject.position.z -= worldSize;
            if (yawObject.position.z < -worldSize / 2) yawObject.position.z += worldSize;
        }
    }

    // Keep camera at a steady eye height
    yawObject.position.y = 1.6;

    // Make sky sphere follow camera
    if (skySphere) {
        skySphere.position.copy(camera.position);
    }

    // Move wolves
    wolves.forEach(wolf => {
        if (wolf.userData.mixer) {
            wolf.userData.mixer.update(delta);
        } else if (!wolfTemplate) {
            // Simple animation for fallback wolves
            wolf.userData.animationTime += delta;
            const legOffset = Math.sin(wolf.userData.animationTime * 8) * 0.1;

            // Animate legs (indices 5-8 are the legs in the new model)
            for (let i = 5; i <= 8; i++) {
                if (wolf.children[i]) {
                    wolf.children[i].position.y = 0.3 + legOffset * ((i % 2 === 0) ? 1 : -1);
                }
            }

            // Animate tail (last child)
            const tailIndex = wolf.children.length - 1;
            if (wolf.children[tailIndex]) {
                wolf.children[tailIndex].rotation.z = Math.PI / 3 + Math.sin(wolf.userData.animationTime * 6) * 0.3;
            }
        }

        wolf.userData.changeDirectionTimer++;
        if (wolf.userData.aggressive) {
            // Move towards player
            const playerPos = yawObject.position.clone();
            wolf.userData.direction = playerPos.sub(wolf.position).normalize();
            wolf.userData.speed = 0.05; // Faster when aggressive
        } else if (wolf.userData.changeDirectionTimer > 120 + Math.random() * 60) { // Change direction every 2-3 seconds
            wolf.userData.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            wolf.userData.changeDirectionTimer = 0;
        }

        const newPosition = wolf.position.clone().add(wolf.userData.direction.clone().multiplyScalar(wolf.userData.speed));

        // World wrapping for wolves
        const worldSize = 100;
        if (newPosition.x > worldSize / 2) newPosition.x -= worldSize;
        if (newPosition.x < -worldSize / 2) newPosition.x += worldSize;
        if (newPosition.z > worldSize / 2) newPosition.z -= worldSize;
        if (newPosition.z < -worldSize / 2) newPosition.z += worldSize;

        wolf.position.copy(newPosition);
        wolf.lookAt(wolf.position.clone().add(wolf.userData.direction));
    });

    // Move zombies
    zombies.forEach(zombie => {
        zombie.userData.changeDirectionTimer++;
        if (zombie.userData.changeDirectionTimer > 120 + Math.random() * 60) { // Change direction every 2-3 seconds
            zombie.userData.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            zombie.userData.changeDirectionTimer = 0;
        }

        const newPosition = zombie.position.clone().add(zombie.userData.direction.clone().multiplyScalar(zombie.userData.speed));

        // World wrapping for zombies
        const worldSize = 100;
        if (newPosition.x > worldSize / 2) newPosition.x -= worldSize;
        if (newPosition.x < -worldSize / 2) newPosition.x += worldSize;
        if (newPosition.z > worldSize / 2) newPosition.z -= worldSize;
        if (newPosition.z < -worldSize / 2) newPosition.z += worldSize;

        zombie.position.copy(newPosition);
        zombie.lookAt(zombie.position.clone().add(zombie.userData.direction));
    });

    // Move bullets
    bullets.forEach((bullet, index) => {
        bullet.position.add(bullet.userData.direction.clone().multiplyScalar(bullet.userData.speed));

        // World wrapping for bullets
        const worldSize = 100;
        if (bullet.position.x > worldSize / 2) bullet.position.x -= worldSize;
        if (bullet.position.x < -worldSize / 2) bullet.position.x += worldSize;
        if (bullet.position.z > worldSize / 2) bullet.position.z -= worldSize;
        if (bullet.position.z < -worldSize / 2) bullet.position.z += worldSize;

        bullet.userData.life++;

        if (bullet.userData.life > bullet.userData.maxLife) {
            scene.remove(bullet);
            bullets.splice(index, 1);
        }
    });

    // Move tamed wolves
    tamedWolves.forEach(wolf => {
        // Follow player
        const playerPos = yawObject.position.clone();
        const direction = playerPos.sub(wolf.position).normalize();
        wolf.position.add(direction.multiplyScalar(0.05));

        // World wrapping for tamed wolves
        const worldSize = 100;
        if (wolf.position.x > worldSize / 2) wolf.position.x -= worldSize;
        if (wolf.position.x < -worldSize / 2) wolf.position.x += worldSize;
        if (wolf.position.z > worldSize / 2) wolf.position.z -= worldSize;
        if (wolf.position.z < -worldSize / 2) wolf.position.z += worldSize;

        // Look for nearby zombies to attack
        let nearestZombie = null;
        let nearestDistance = 10; // Attack range

        zombies.forEach(zombie => {
            const distance = wolf.position.distanceTo(zombie.position);
            if (distance < nearestDistance) {
                nearestZombie = zombie;
                nearestDistance = distance;
            }
        });

        if (nearestZombie) {
            // Attack zombie
            nearestZombie.userData.health -= 0.5; // Tamed wolf damage over time

            if (nearestZombie.userData.health <= 0) {
                const index = zombies.indexOf(nearestZombie);
                if (index > -1) zombies.splice(index, 1);
                scene.remove(nearestZombie);
            }
        }

        wolf.lookAt(wolf.position.clone().add(direction));
    });

    // Check for nearby trees or stone nodes
    let foundTree = null;
    let foundStone = null;
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    trees.forEach(tree => {
        const distance = cameraWorldPos.distanceTo(tree.mesh.position);
        if (distance < 5) { // Within punching range
            foundTree = tree;
        }
    });
    items.forEach(item => {
        if (item.userData && item.userData.type === 'stone_node') {
            const distance = cameraWorldPos.distanceTo(item.position);
            if (distance < 5) {
                foundStone = item;
            }
        }
    });

    const treeChanged = nearbyTree !== foundTree;
    const stoneChanged = nearbyStone !== foundStone;
    nearbyTree = foundTree;
    nearbyStone = foundStone;

    // Check for nearby items
    let foundItem = null;
    items.forEach((item, index) => {
        const distance = cameraWorldPos.distanceTo(item.position);
        if (distance < 1.5) {
            foundItem = item;
        }
    });

    const itemChanged = nearbyItem !== foundItem;
    nearbyItem = foundItem;

    // Check crosshair target for health bar
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 50; // Long range for aiming

    const allTargets = wolves.concat(zombies).concat(trees.map(t => t.mesh));
    const intersects = raycaster.intersectObjects(allTargets, true);

    let target = null;
    if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit && !hit.userData.type && hit.parent) {
            hit = hit.parent;
        }
        if (hit && (hit.userData.type === 'wolf' || hit.userData.type === 'zombie' || hit.userData.type === 'tree')) {
            target = hit;
        }
    }

    // Update crosshair health bar
    const healthBar = document.getElementById('crosshair-health-bar');
    const healthFill = document.getElementById('crosshair-health-fill');
    if (target) {
        const maxHealth = target.userData.type === 'tree' ? 170 : 20; // Trees have 170, enemies 20
        const currentHealth = target.userData.health;
        const healthPercent = (currentHealth / maxHealth) * 100;
        healthFill.style.width = `${healthPercent}%`;
        healthBar.style.display = 'block';
    } else {
        healthBar.style.display = 'none';
    }

    // Handle item collection with E key
    if (nearbyItem && keys['KeyE']) {
        const itemType = nearbyItem.userData.itemType;
        const added = addItemToInventory(itemType, 1);

        if (added) {
            scene.remove(nearbyItem);
            items.splice(items.indexOf(nearbyItem), 1);
            nearbyItem = null;
            updateUI();
        }
        keys['KeyE'] = false; // Prevent continuous collection
    }

    // Only update UI if an item, tree, or stone node became nearby or left range
    if (itemChanged || treeChanged || stoneChanged) {
        updateUI();
    }

    renderer.render(scene, camera);
}

// UI Event Listeners
document.getElementById('start-play-btn').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    init();
});

document.getElementById('sell-btn').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('sell-screen').style.display = 'flex';
    updateSellUI();
});

document.getElementById('trade-btn').addEventListener('click', () => {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('trade-screen').style.display = 'flex';
});

document.getElementById('in-game-sell-btn').addEventListener('click', () => {
    closePauseMenu(false);
    document.getElementById('sell-screen').style.display = 'flex';
    updateSellUI();
});

document.getElementById('in-game-trade-btn').addEventListener('click', () => {
    closePauseMenu(false);
    document.getElementById('trade-screen').style.display = 'flex';
});

document.getElementById('in-game-craft-btn').addEventListener('click', () => {
    closePauseMenu(false);
    document.getElementById('crafting-screen').style.display = 'flex';
    updateCraftingUI();
});

document.getElementById('resume-btn').addEventListener('click', () => {
    closePauseMenu(true);
});

document.getElementById('back-from-sell').addEventListener('click', () => {
    document.getElementById('sell-screen').style.display = 'none';
    if (isPaused) {
        document.getElementById('pause-screen').style.display = 'flex';
    } else {
        document.getElementById('start-screen').style.display = 'flex';
    }
});

document.getElementById('back-from-trade').addEventListener('click', () => {
    document.getElementById('trade-screen').style.display = 'none';
    if (isPaused) {
        document.getElementById('pause-screen').style.display = 'flex';
    } else {
        document.getElementById('start-screen').style.display = 'flex';
    }
});

// Sell functionality
document.querySelectorAll('.sell-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const itemType = e.target.dataset.item;
        sellItem(itemType);
    });
});

// Trade functionality
document.querySelectorAll('.trade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const npcType = e.target.dataset.npc;
        openTradeMenu(npcType);
    });
});

// Craft functionality
document.querySelectorAll('.craft-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const recipe = e.target.dataset.recipe;
        doCraft(recipe);
    });
});

document.getElementById('back-from-crafting').addEventListener('click', () => {
    document.getElementById('crafting-screen').style.display = 'none';
    if (isPaused) {
        document.getElementById('pause-screen').style.display = 'flex';
        const canvas = document.getElementById('game-canvas');
        if (canvas) canvas.style.pointerEvents = 'none';
    } else {
        document.getElementById('start-screen').style.display = 'flex';
    }
});

function openCraftingMenu() {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer || gameContainer.style.display !== 'block') {
        return;
    }
    isPaused = true;
    keys = {};
    document.exitPointerLock();
    document.getElementById('crafting-screen').style.display = 'flex';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('sell-screen').style.display = 'none';
    document.getElementById('trade-screen').style.display = 'none';
    const canvas = document.getElementById('game-canvas');
    if (canvas) canvas.style.pointerEvents = 'none';
    updateCraftingUI();
}

function updateCraftingUI() {
    // Count materials - just for display purposes
    const woodCount = getItemCount('wood');
    const stoneCount = getItemCount('stone');

    // All buttons are enabled - let user see what they can craft
    const craftButtons = document.querySelectorAll('.craft-btn');
    craftButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });
}

function doCraft(recipe) {
    const woodCount = getItemCount('wood');
    const stoneCount = getItemCount('stone');

    let woodNeeded = 0;
    let stoneNeeded = 0;
    let itemCrafted = null;

    if (recipe === 'axe') {
        woodNeeded = 2;
        stoneNeeded = 2;
        itemCrafted = 'axe';
    } else if (recipe === 'gun') {
        woodNeeded = 3;
        stoneNeeded = 3;
        itemCrafted = 'gun';
    } else if (recipe === 'pickaxe') {
        woodNeeded = 8;
        stoneNeeded = 0;
        itemCrafted = 'pickaxe';
    }

    // Show notification
    const damageDisplay = document.getElementById('damage-display');
    
    // Check if we have enough materials
    if (woodCount < woodNeeded || stoneCount < stoneNeeded) {
        damageDisplay.textContent = `Need ${woodNeeded} wood${stoneNeeded > 0 ? ` and ${stoneNeeded} stone` : ''}`;
        damageDisplay.style.color = 'red';
        damageDisplay.style.display = 'block';
        setTimeout(() => {
            damageDisplay.style.display = 'none';
        }, 1500);
        return;
    }

    // Remove materials
    removeItemsFromInventory('wood', woodNeeded);
    removeItemsFromInventory('stone', stoneNeeded);

    // Add crafted item to inventory
    addItemToInventory(itemCrafted, 1);

    // Show crafting notification
    damageDisplay.textContent = `Crafted ${itemCrafted}!`;
    damageDisplay.style.color = '#4FC3F7';
    damageDisplay.style.display = 'block';
    setTimeout(() => {
        damageDisplay.style.display = 'none';
        damageDisplay.style.color = 'red';
    }, 1500);

    updateCraftingUI();
    updateUI();
}

function openPauseMenu() {
    const pauseScreen = document.getElementById('pause-screen');
    if (!pauseScreen) return;
    isPaused = true;
    keys = {};
    document.exitPointerLock();
    pauseScreen.style.display = 'flex';
    if (crosshair) {
        crosshair.style.display = 'none';
        crosshair.style.visibility = 'hidden';
    }
    const canvas = document.getElementById('game-canvas');
    if (canvas) canvas.style.pointerEvents = 'none';
    document.getElementById('sell-screen').style.display = 'none';
    document.getElementById('trade-screen').style.display = 'none';
    updateSellUI();
}

function closePauseMenu(resume = false) {
    const pauseScreen = document.getElementById('pause-screen');
    if (!pauseScreen) return;
    pauseScreen.style.display = 'none';
    document.getElementById('sell-screen').style.display = 'none';
    document.getElementById('trade-screen').style.display = 'none';
    const canvas = document.getElementById('game-canvas');
    if (canvas) canvas.style.pointerEvents = 'auto';
    if (resume) {
        isPaused = false;
        if (crosshair) {
            crosshair.style.display = 'block';
            crosshair.style.visibility = 'visible';
        }
    }
}

function updateSellUI() {
    document.getElementById('coin-count').textContent = playerCoins;
    const coinsDisplay = document.getElementById('coins');
    if (coinsDisplay) {
        coinsDisplay.textContent = `Coins: ${playerCoins}`;
    }
}

function sellItem(itemType) {
    let itemCount = getItemCount(itemType);
    let sellPrice = 0;

    // Set sell prices
    switch (itemType) {
        case 'pelt': sellPrice = 10; break;
        case 'paw': sellPrice = 5; break;
        case 'head': sellPrice = 15; break;
        case 'wood': sellPrice = 2; break;
    }

    if (itemCount > 0) {
        removeItemsFromInventory(itemType, 1);
        playerCoins += sellPrice;

        // Show selling animation/notification
        const damageDisplay = document.getElementById('damage-display');
        damageDisplay.textContent = `+${sellPrice} 💰`;
        damageDisplay.style.color = 'gold';
        damageDisplay.style.display = 'block';
        setTimeout(() => {
            damageDisplay.style.display = 'none';
            damageDisplay.style.color = 'red'; // Reset color
        }, 1500);

        updateSellUI();
    } else {
        alert(`You don't have any ${itemType} to sell!`);
    }
}

function openTradeMenu(npcType) {
    let tradeOptions = [];
    
    switch (npcType) {
        case 'mountain':
            tradeOptions = [
                { item: 'Crystal Ore', cost: 50, description: 'Rare mineral from mountain mines' },
                { item: 'Enchanted Pickaxe', cost: 100, description: 'Magically enhanced mining tool' }
            ];
            break;
        case 'forest':
            tradeOptions = [
                { item: 'Health Potion', cost: 30, description: 'Restores full health' },
                { item: 'Speed Elixir', cost: 40, description: 'Temporarily increases movement speed' }
            ];
            break;
        case 'desert':
            tradeOptions = [
                { item: 'Rare Spice', cost: 25, description: 'Exotic seasoning from desert traders' },
                { item: 'Sand Boots', cost: 60, description: 'Perfect for traversing sandy terrain' }
            ];
            break;
    }

    const tradeHTML = tradeOptions.map(option => `
        <div class="trade-option">
            <div class="trade-info">
                <strong>${option.item}</strong><br>
                <small>${option.description}</small><br>
                <span class="trade-cost">Cost: ${option.cost} coins</span>
            </div>
            <button class="buy-btn" data-item="${option.item}" data-cost="${option.cost}">Buy</button>
        </div>
    `).join('');

    // Update the trade screen content
    const tradeButton = document.querySelector(`.trade-btn[data-npc="${npcType}"]`);
    const npcCard = tradeButton ? tradeButton.closest('.npc-card') : null;
    if (!npcCard) {
        return;
    }

    const cardTitle = npcCard.querySelector('h3') ? npcCard.querySelector('h3').textContent : '';
    const cardDesc = npcCard.querySelector('p') ? npcCard.querySelector('p').textContent : '';

    npcCard.querySelector('.trade-options').innerHTML = tradeHTML;

    // Add buy button listeners
    npcCard.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.dataset.item;
            const cost = parseInt(e.target.dataset.cost);
            buyItem(item, cost);
        });
    });
}

function buyItem(item, cost) {
    if (playerCoins >= cost) {
        playerCoins -= cost;
        
        const itemType = item.toLowerCase().replace(' ', '_');
        const added = addItemToInventory(itemType, 1);
        
        if (added) {
            alert(`Purchased ${item} for ${cost} coins!`);
            updateSellUI();
            updateUI();
        } else {
            alert('No inventory space available!');
            playerCoins += cost; // Refund
        }
    } else {
        alert('Not enough coins!');
    }
}