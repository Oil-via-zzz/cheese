// Game variables
let scene, camera, renderer;
let yawObject, pitchObject;
let player = { health: 100, ammo: 30 };
let inventory = { paws: 0, heads: 0, pelts: 0 };
let hasGun = false;
let hasAxe = false;
let wolves = [];
let items = [];
let trees = [];
let keys = {};
let mouse = { x: 0, y: 0 };
let isPointerLocked = false;
let nearbyItem = null;
let activeSlot = 0;
let wolfTemplate = null;
let wolfAnimations = null;
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
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    directionalLight.target = ground;
    scene.add(directionalLight.target);

    // Create some trees/obstacles
    for (let i = 0; i < 20; i++) {
        createTree(Math.random() * 80 - 40, Math.random() * 80 - 40);
    }

    // Spawn Axe and Gun on the ground
    createItem(5, 5, 'axe');
    createItem(-5, 5, 'gun');

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

    // Add crosshair
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    document.body.appendChild(crosshair);

    // Event listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    window.addEventListener('resize', onWindowResize);

    // Start game loop
    animate();
    updateUI(); // Initial UI draw
}

// Create a simple tree
function createTree(x, z) {
    const treeGroup = new THREE.Group();
    
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2);
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
    treeGroup.userData = { type: 'tree' };
    scene.add(treeGroup);
    trees.push({ x, z, radius: 0.5, mesh: treeGroup }); // Store mesh for removal
}

function createWolf(x, z) {
    let wolf;

    if (wolfTemplate) {
        wolf = THREE.SkeletonUtils.clone(wolfTemplate);
        wolf.position.set(x, 0, z);
    } else {
        // Create a detailed wolf-like model with better proportions
        wolf = new THREE.Group();

        // Main body (torso)
        const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.set(0, 0.6, 0);
        body.rotation.z = Math.PI / 2;
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
        health: 3,
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
    } else {
        const itemGeometry = new THREE.SphereGeometry(0.2);
        let color;
        switch (type) {
            case 'paw': color = 0x8B4513; break;
            case 'head': color = 0xFF0000; break;
            case 'pelt': color = 0xFFFF00; break;
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
    if (event.code === 'Digit1') { activeSlot = 0; updateUI(); }
    if (event.code === 'Digit2') { activeSlot = 1; updateUI(); }
    if (event.code === 'Digit3') { activeSlot = 2; updateUI(); }
    if (event.code === 'Digit4') { activeSlot = 3; updateUI(); }
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
        document.getElementById('game-canvas').requestPointerLock();
        return;
    }

    if (player.ammo > 0) {
        player.ammo--;
        updateUI();

        // Raycast from camera
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        const intersects = raycaster.intersectObjects(wolves, true);

        if (intersects.length > 0) {
            let hitWolf = intersects[0].object;
            while (hitWolf && !hitWolf.userData.type) {
                hitWolf = hitWolf.parent;
            }
            if (hitWolf && hitWolf.userData.type === 'wolf') {
                hitWolf.userData.health--;

                if (hitWolf.userData.health <= 0) {
                    // Kill wolf and drop items
                    const index = wolves.indexOf(hitWolf);
                    if (index > -1) wolves.splice(index, 1);
                    scene.remove(hitWolf);

                    // Drop random items
                    const dropX = hitWolf.position.x + (Math.random() - 0.5) * 2;
                    const dropZ = hitWolf.position.z + (Math.random() - 0.5) * 2;

                    const drops = ['paw', 'head', 'pelt'];
                    for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
                        createItem(dropX, dropZ, drops[Math.floor(Math.random() * drops.length)]);
                    }
                }
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
function updateUI() {
    document.getElementById('health').textContent = `Health: ${player.health}`;
    document.getElementById('ammo').textContent = `Ammo: ${player.ammo}`;
    document.getElementById('paws-count').textContent = inventory.paws;
    document.getElementById('heads-count').textContent = inventory.heads;
    document.getElementById('pelts-count').textContent = inventory.pelts;
    
    // Show pickup prompt
    const pickupPrompt = document.getElementById('pickup-prompt');
    if (nearbyItem) {
        const itemName = nearbyItem.userData.itemType.charAt(0).toUpperCase() + nearbyItem.userData.itemType.slice(1);
        pickupPrompt.textContent = `Press E to pick up ${itemName}`;
        pickupPrompt.style.display = 'block';
    } else {
        pickupPrompt.style.display = 'none';
    }

    // Update Hotbar visuals
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (slot) {
            let label = "";
            if (i === 0) label = hasGun ? "GUN" : "FIST";
            if (i === 1) label = hasAxe ? "AXE" : "FIST";
            if (i >= 2) label = "FIST";
            
            slot.innerHTML = `<span class="slot-number">${i+1}</span>${label}`;

            if (i === activeSlot) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        }
    }
}

// Game loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

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

        // Simple collision detection with trees
        let canMove = true;
        for (let tree of trees) {
            const dist = Math.sqrt(Math.pow(nextPos.x - tree.x, 2) + Math.pow(nextPos.z - tree.z, 2));
            if (dist < tree.radius + 0.5) { // 0.5 is player radius
                canMove = false;
                break;
            }
        }

        if (canMove) {
            yawObject.position.copy(nextPos);
        }
    }

    // Keep camera at a steady eye height
    yawObject.position.y = 1.6;

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
        if (wolf.userData.changeDirectionTimer > 120 + Math.random() * 60) { // Change direction every 2-3 seconds
            wolf.userData.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            wolf.userData.changeDirectionTimer = 0;
        }

        const newPosition = wolf.position.clone().add(wolf.userData.direction.clone().multiplyScalar(wolf.userData.speed));

        if (newPosition.x < -40 || newPosition.x > 40) {
            wolf.userData.direction.x *= -1;
        }
        if (newPosition.z < -40 || newPosition.z > 40) {
            wolf.userData.direction.z *= -1;
        }

        wolf.position.add(wolf.userData.direction.clone().multiplyScalar(wolf.userData.speed));
        wolf.lookAt(wolf.position.clone().add(wolf.userData.direction));
    });

    // Check for nearby items
    let foundItem = null;
    const cameraWorldPos = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    items.forEach((item, index) => {
        const distance = cameraWorldPos.distanceTo(item.position);
        if (distance < 1.5) {
            foundItem = item;
        }
    });

    const itemChanged = nearbyItem !== foundItem;
    nearbyItem = foundItem;

    // Handle item collection with E key
    if (nearbyItem && keys['KeyE']) {
        switch (nearbyItem.userData.itemType) {
            case 'paw': inventory.paws++; break;
            case 'head': inventory.heads++; break;
            case 'pelt': inventory.pelts++; break;
            case 'axe': hasAxe = true; break;
            case 'gun': hasGun = true; break;
        }
        scene.remove(nearbyItem);
        items.splice(items.indexOf(nearbyItem), 1);
        nearbyItem = null;
        updateUI();
        keys['KeyE'] = false; // Prevent continuous collection
    }

    // Only update UI if an item became nearby or left range
    if (itemChanged) {
        updateUI();
    }

    renderer.render(scene, camera);
}

// Start the game
init();