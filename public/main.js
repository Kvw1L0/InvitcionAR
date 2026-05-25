// --- NUEVAS VARIABLES DE ANIMACIÓN ---
let targetMouthScale = 1.0;
let currentMouthScale = 1.0;
const LERP_FACTOR = 0.15; // Velocidad de suavizado

// --- DENTRO DE ANIMATE() ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (avatarHablando && reproductorAnalyser) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        let maxVolume = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            if (dataArrayPlayback[i] > maxVolume) maxVolume = dataArrayPlayback[i];
        }

        // 1. Mapeo de Volumen a Escala (Boca)
        // Escalamos entre 1.0 (cerrado) y 1.4 (abierto)
        targetMouthScale = 1.0 + (maxVolume / 255.0) * 0.4;
        
        // 2. Intensidad Lumínica Suave (sin quemar el Bloom)
        const targetIntensity = 3.0 + (maxVolume / 255.0) * 15.0; // Max 18.0, suficiente para brillar sin "quemar"
        emissiveMaterials.forEach(mat => {
            mat.emissiveIntensity += (targetIntensity - mat.emissiveIntensity) * LERP_FACTOR;
        });
    } else {
        targetMouthScale = 1.0; // Vuelve a reposo
        // Respiración suave
        emissiveMaterials.forEach(mat => {
            mat.emissiveIntensity = 3.0 + Math.sin(Date.now() * 0.003) * 1.0;
        });
    }

    // 3. APLICACIÓN SUAVE (LERP)
    currentMouthScale += (targetMouthScale - currentMouthScale) * LERP_FACTOR;
    
    // --- Aplicación de deformación a la malla de la boca ---
    model.traverse((child) => {
        if (child.name.toLowerCase().includes('boca')) {
            child.scale.y = currentMouthScale; // Solo escala vertical
        }
        // Animación suave de ojos (leve oscilación al hablar)
        if (child.name.toLowerCase().includes('ojo') && avatarHablando) {
            child.position.z = Math.sin(Date.now() * 0.01) * 0.01;
        }
    });

    composer.render();
}