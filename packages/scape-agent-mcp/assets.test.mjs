import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {avatarFiles} from './assets.mjs';
test('MCP avatar files are limited to the operator-selected folder and bounded file types',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'scape-avatar-files-')),outside=await mkdtemp(path.join(tmpdir(),'scape-private-files-'));
  try {
    await writeFile(path.join(root,'fox.png'),'image');await writeFile(path.join(root,'secret.txt'),'hidden');
    await writeFile(path.join(outside,'private.png'),'private');await symlink(path.join(outside,'private.png'),path.join(root,'link.png'));
    const files=avatarFiles(root);assert.deepEqual(await files.list(),{assets:['fox.png']});
    assert.equal(Buffer.from(await files.read('fox.png','image'),'base64').toString(),'image');
    for(const name of ['../private.png','/tmp/private.png','secret.txt','link.png'])await assert.rejects(files.read(name,'image'));
    await assert.rejects(files.read('fox.png','glb'));
    await writeFile(path.join(root,'huge.glb'),Buffer.alloc(512*1024+1));await assert.rejects(files.read('huge.glb','glb'),/512/);
    assert.deepEqual(await avatarFiles().list(),{assets:[]});
  } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
