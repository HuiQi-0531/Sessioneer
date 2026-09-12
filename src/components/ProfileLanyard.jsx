/* eslint-disable react/no-unknown-property */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import { getAvatarLetter, getDisplayName } from '../utils/userName';
import qutLogo from '../assets/qut-logo.svg';
import '../styles/ProfileLanyard.css';

extend({ MeshLineGeometry, MeshLineMaterial });

const CARD_ASPECT = 1.45;
const QUT_BLUE = '#0047BA';
const QUT_NAVY = '#071D49';
const BADGE_WIDTH = 768;
const BADGE_HEIGHT = 1080;
const BADGE_TEXTURE_SCALE = 2;

const loadImage = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const roundedRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

const fitText = (ctx, text, maxWidth, initialSize, minSize, weight = 800) => {
  let size = initialSize;
  do {
    ctx.font = `${weight} ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size >= minSize);
  return minSize;
};

const makeCanvasTexture = (canvas) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

const createFrontTexture = async ({ profile, roleLabel }) => {
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_WIDTH * BADGE_TEXTURE_SCALE;
  canvas.height = BADGE_HEIGHT * BADGE_TEXTURE_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(BADGE_TEXTURE_SCALE, BADGE_TEXTURE_SCALE);
  const name = getDisplayName(profile);
  const initial = getAvatarLetter(profile);

  ctx.fillStyle = '#F8FBFF';
  ctx.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, BADGE_WIDTH, 320);
  gradient.addColorStop(0, QUT_NAVY);
  gradient.addColorStop(1, QUT_BLUE);
  ctx.fillStyle = gradient;
  roundedRect(ctx, 44, 44, 680, 992, 48);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, 78, 90, 612, 900, 38);
  ctx.fill();

  ctx.fillStyle = QUT_BLUE;
  ctx.font = '900 58px Arial';
  ctx.fillText('QUT', 118, 172);

  ctx.fillStyle = '#475569';
  ctx.font = '800 30px Arial';
  ctx.fillText('SESSIONEER ID', 118, 218);

  const avatar = await loadImage(profile?.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(384, 412, 160, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    const scale = Math.max(320 / avatar.width, 320 / avatar.height);
    const width = avatar.width * scale;
    const height = avatar.height * scale;
    ctx.drawImage(avatar, 384 - width / 2, 412 - height / 2, width, height);
  } else {
    ctx.fillStyle = '#DBEAFE';
    ctx.fillRect(224, 252, 320, 320);
    ctx.fillStyle = QUT_BLUE;
    ctx.font = '900 150px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 384, 420);
  }
  ctx.restore();

  ctx.strokeStyle = '#DBEAFE';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(384, 412, 169, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0F172A';
  const nameSize = fitText(ctx, name, 560, 58, 34, 900);
  ctx.font = `900 ${nameSize}px Arial`;
  ctx.fillText(name, 384, 665);

  ctx.fillStyle = '#334155';
  ctx.font = '800 34px Arial';
  ctx.fillText(roleLabel, 384, 720);

  ctx.fillStyle = '#E0F2FE';
  roundedRect(ctx, 160, 790, 448, 82, 41);
  ctx.fill();
  ctx.fillStyle = QUT_BLUE;
  ctx.font = '900 34px Arial';
  ctx.fillText('Digital Learning Team', 384, 842);

  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(150, 914, 468, 6);
  ctx.fillStyle = '#64748B';
  ctx.font = '800 24px Arial';
  ctx.fillText('Swipe or drag the card', 384, 962);

  return makeCanvasTexture(canvas);
};

const createBackTexture = async () => {
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_WIDTH * BADGE_TEXTURE_SCALE;
  canvas.height = BADGE_HEIGHT * BADGE_TEXTURE_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(BADGE_TEXTURE_SCALE, BADGE_TEXTURE_SCALE);
  const logo = await loadImage(qutLogo);

  ctx.fillStyle = QUT_NAVY;
  ctx.fillRect(0, 0, BADGE_WIDTH, BADGE_HEIGHT);
  ctx.fillStyle = QUT_BLUE;
  ctx.fillRect(0, 0, canvas.width, 330);

  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, 108, 238, 552, 470, 48);
  ctx.fill();

  if (logo) {
    ctx.drawImage(logo, 192, 278, 384, 384);
  } else {
    ctx.fillStyle = QUT_BLUE;
    ctx.font = '900 160px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QUT', 384, 445);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#D8ECFF';
  ctx.font = '800 30px Arial';
  ctx.fillText('Sessioneer access pass', 384, 800);
  ctx.font = '700 24px Arial';
  ctx.fillText('Teaching allocation system', 384, 842);

  ctx.strokeStyle = '#4A90E2';
  ctx.lineWidth = 12;
  roundedRect(ctx, 78, 80, 612, 920, 54);
  ctx.stroke();

  return makeCanvasTexture(canvas);
};

const createBandTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = QUT_NAVY;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = QUT_BLUE;
  for (let x = -80; x < canvas.width; x += 160) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.transform(1, 0, -0.45, 1, 0, 0);
    ctx.fillRect(36, 0, 76, canvas.height);
    ctx.restore();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 34px Arial';
  ctx.textBaseline = 'middle';
  for (let x = 22; x < canvas.width; x += 170) {
    ctx.fillText('QUT', x, 50);
  }

  ctx.strokeStyle = '#9CCBFF';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(canvas.width, 10);
  ctx.moveTo(0, 86);
  ctx.lineTo(canvas.width, 86);
  ctx.stroke();

  const texture = makeCanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 1);
  return texture;
};

function useBadgeTextures(profile, roleLabel) {
  const [textures, setTextures] = useState(null);
  const [error, setError] = useState(null);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let generated = [];
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setIsSlow(true);
    }, 900);

    setTextures(null);
    setError(null);
    setIsSlow(false);

    Promise.all([createFrontTexture({ profile, roleLabel }), createBackTexture()])
      .then(([frontTexture, backTexture]) => {
        if (cancelled) {
          frontTexture.dispose();
          backTexture.dispose();
          return;
        }

        const bandTexture = createBandTexture();
        generated = [frontTexture, backTexture, bandTexture];
        setTextures({ frontTexture, backTexture, bandTexture });
      })
      .catch((textureError) => {
        if (!cancelled) {
          console.error('Profile lanyard texture generation failed:', textureError);
          setError(textureError);
        }
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      generated.forEach((texture) => texture.dispose());
    };
  }, [profile, roleLabel]);

  return { textures, error, isSlow };
}

function LanyardPhysics({ textures }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0.1, isMobile ? 13 : 12], fov: isMobile ? 32 : 28 }}
      dpr={[1, isMobile ? 1.5 : 2]}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), 0)}
    >
      <ambientLight intensity={1.8} />
      <hemisphereLight args={['#ffffff', '#dbeafe', 1.8]} />
      <directionalLight position={[3, 4, 7]} intensity={2.6} />
      <directionalLight position={[-4, 1, 4]} intensity={1.2} />
      <Physics gravity={[0, -35, 0]} timeStep={isMobile ? 1 / 30 : 1 / 60}>
        <Band textures={textures} isMobile={isMobile} />
      </Physics>
    </Canvas>
  );
}

function Band({ textures, isMobile }) {
  const fixed = useRef();
  const j1 = useRef();
  const j2 = useRef();
  const j3 = useRef();
  const card = useRef();
  const band = useRef();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const ang = useMemo(() => new THREE.Vector3(), []);
  const rot = useMemo(() => new THREE.Vector3(), []);
  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);
  const [curve] = useState(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
  );
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 };

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 0.95]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 0.95]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 0.95]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.15, 0]]);

  useEffect(() => {
    if (!hovered) return undefined;
    document.body.style.cursor = dragged ? 'grabbing' : 'grab';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged && card.current) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      });
    }

    if (!fixed.current || !j1.current || !j2.current || !j3.current || !card.current || !band.current) return;

    [j1, j2].forEach((ref) => {
      if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
      const distance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
      ref.current.lerped.lerp(ref.current.translation(), delta * (6 + distance * 36));
    });

    curve.points[0].copy(j3.current.translation());
    curve.points[1].copy(j2.current.lerped);
    curve.points[2].copy(j1.current.lerped);
    curve.points[3].copy(fixed.current.translation());
    band.current.geometry.setPoints(curve.getPoints(isMobile ? 18 : 34));

    ang.copy(card.current.angvel());
    rot.copy(card.current.rotation());
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.22, z: ang.z });
  });

  curve.curveType = 'chordal';

  return (
    <>
      <group position={[-0.02, 3.18, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.45, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0.95, -0.15, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.45, -0.3, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.75, -1.25, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[0.82, 1.19, 0.06]} />
          <group
            scale={1.8}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(event) => {
              event.target.releasePointerCapture(event.pointerId);
              drag(false);
            }}
            onPointerDown={(event) => {
              event.target.setPointerCapture(event.pointerId);
              drag(new THREE.Vector3().copy(event.point).sub(vec.copy(card.current.translation())));
            }}
          >
            <mesh>
              <boxGeometry args={[1.05, CARD_ASPECT, 0.06]} />
              <meshPhysicalMaterial color="#EEF4FF" roughness={0.38} metalness={0.1} clearcoat={0.8} />
            </mesh>
            <mesh position={[0, 0, 0.035]}>
              <planeGeometry args={[1, CARD_ASPECT]} />
              <meshBasicMaterial map={textures.frontTexture} toneMapped={false} />
            </mesh>
            <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.035]}>
              <planeGeometry args={[1, CARD_ASPECT]} />
              <meshBasicMaterial map={textures.backTexture} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.79, 0.052]}>
              <capsuleGeometry args={[0.025, 0.16, 8, 14]} />
              <meshStandardMaterial color="#111827" metalness={0.44} roughness={0.26} />
            </mesh>
            <mesh position={[0, 0.68, 0.055]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.07, 0.017, 10, 34, Math.PI * 1.55]} />
              <meshStandardMaterial color="#111827" metalness={0.44} roughness={0.26} />
            </mesh>
            <mesh position={[0, 0.59, 0.058]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.016, 0.1, 8, 12]} />
              <meshStandardMaterial color="#111827" metalness={0.38} roughness={0.32} />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [900, 1200] : [1200, 900]}
          useMap
          map={textures.bandTexture}
          repeat={[-3.2, 1]}
          lineWidth={isMobile ? 0.9 : 1.05}
        />
      </mesh>
    </>
  );
}

export default function ProfileLanyard({ profile, roleLabel }) {
  const resolvedRoleLabel = roleLabel || 'Sessioneer user';
  const { textures, error, isSlow } = useBadgeTextures(profile, resolvedRoleLabel);

  if (error) {
    return (
      <section className="pf-lanyard-panel" aria-label="QUT profile lanyard unavailable">
        <div className="pf-lanyard-loader">
          <div className="pf-lanyard-loader-mark is-error" />
          <span>3D badge could not prepare its textures.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="pf-lanyard-panel" aria-label="QUT profile lanyard preview">
      {!textures && (
        <div className="pf-lanyard-loader">
          <div className="pf-lanyard-loader-mark" />
          <span>{isSlow ? 'Still preparing 3D badge...' : 'Preparing 3D badge...'}</span>
        </div>
      )}
      {textures && (
        <div className="pf-lanyard-stage">
          <LanyardPhysics textures={textures} />
        </div>
      )}
    </section>
  );
}
