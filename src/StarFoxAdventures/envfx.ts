import { vec3 } from 'gl-matrix';
import { DataFetcher } from '../DataFetcher';
import { GfxDevice} from '../gfx/platform/GfxPlatform';

import { GameInfo } from './scenes';
import { TextureCollection, SFATexture, SFATextureCollection } from './textures';
import { dataSubarray } from './util';
import { ObjectInstance, ObjectManager } from './objects';
import { World } from './world';

enum EnvfxType {
    Atmosphere = 5,
    Skyscape = 6,
}

class Atmosphere {
    public textures: (SFATexture | null)[] = [];
}

class Skyscape { // Clouds, mountains, etc.
    public objects: ObjectInstance[] = [];
}

export class EnvfxManager {
    public atmosphere = new Atmosphere();
    public skyscape = new Skyscape();

    private envfxactBin: DataView;
    private readonly ENVFX_SIZE = 0x60;

    private constructor(private world: World) {
    }

    public static async create(world: World, dataFetcher: DataFetcher): Promise<EnvfxManager> {
        const self = new EnvfxManager(world);

        const pathBase = world.gameInfo.pathBase;
        self.envfxactBin = (await dataFetcher.fetchData(`${pathBase}/ENVFXACT.bin`)).createDataView();
        
        return self;
    }

    public loadEnvfx(index: number) {
        const data = dataSubarray(this.envfxactBin, index * this.ENVFX_SIZE, this.ENVFX_SIZE);
        const fields = {
            index: index,
            type: data.getUint8(0x5c),
        };

        if (fields.type === EnvfxType.Atmosphere) {
            const BASE = 0xc38;

            const texIds: number[] = [];
            for (let i = 0; i < 4; i++) {
                texIds.push(data.getUint16(0x2e + i * 2));
            }
            for (let i = 0; i < 4; i++) {
                texIds.push(data.getUint16(0x3e + i * 2));
            }

            this.atmosphere.textures = [];
            for (let i = 0; i < 8; i++) {
                const texId = BASE + texIds[i];
                console.log(`loading atmosphere texture ${i}: 0x${texId.toString(16)}`);
                this.atmosphere.textures[i] = this.world.resColl.texColl.getTexture(this.world.device, texId, false);
            }
        } else if (fields.type === EnvfxType.Skyscape) {
            this.skyscape.objects = [];

            const SKY_RING_TYPES = [0, 0x628, 0x762, 0x863];
            const MOUNTAIN_TYPES = [0, 0x62a, 0x85c, 0x861, 0x863];
            const SKYSCAPE_TYPES = [0, 0x627, 0x629, 0x75e, 0x5f5];

            const skyscapeType = data.getUint8(0x5d);
            if (skyscapeType !== 0) {
                const skyscapeTypeId = SKYSCAPE_TYPES[skyscapeType];
                console.log(`loading skyscape object id 0x${skyscapeTypeId.toString(16)}`);
                const objParams = new DataView(new ArrayBuffer(128)); // XXX: doesn't matter, just spawn the object
                const skyscapeObj = this.world.objectMan.createObjectInstance(skyscapeTypeId, objParams, vec3.create());
                this.skyscape.objects.push(skyscapeObj);
            }

            const skyRingType = data.getUint8(0x5b);
            if (skyRingType !== 0) {
                const skyRingTypeId = SKY_RING_TYPES[skyRingType];
                console.log(`loading skyring object id 0x${skyRingTypeId.toString(16)}`);
                const objParams = new DataView(new ArrayBuffer(128)); // XXX: doesn't matter, just spawn the object
                const skyRingObj = this.world.objectMan.createObjectInstance(skyRingTypeId, objParams, vec3.create());
                this.skyscape.objects.push(skyRingObj);
            }

            const mountainType = data.getUint8(0x5a);
            if (mountainType !== 0) {
                const mountainTypeId = MOUNTAIN_TYPES[mountainType];
                console.log(`loading mountain object id 0x${mountainTypeId.toString(16)}`);
                const objParams = new DataView(new ArrayBuffer(128)); // XXX: doesn't matter, just spawn the object
                const mountainObj = this.world.objectMan.createObjectInstance(mountainTypeId, objParams, vec3.create());
                this.skyscape.objects.push(mountainObj);
            }
        } else {
            console.warn(`Don't know how to load envfx type ${fields.type}`);
        }

        return fields;
    }
}