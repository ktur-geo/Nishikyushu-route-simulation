// 公開に必要なファイルだけを新しいディレクトリに出力する。既存ファイルは削除しない。
import { mkdir, copyFile, readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=path.resolve(process.argv[2] || path.join(root,'dist'));
try { await access(output); throw new Error('出力先は既に存在します。新しいディレクトリを指定してください。'); }
catch(error) { if(error.code!=='ENOENT') throw error; }
const files=new Set(['index.html','about.html','creator.html','method.html','privacy.html','index.css','document.css','jquery/jquery-3.7.1.min.js','script/translate.js','data/README.md']);
async function addModule(file) {
  if(files.has(file)) return;
  files.add(file);
  const source=await readFile(path.join(root,file),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.js)['"]/g)) {
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));
    if(target.startsWith('../')) throw new Error('モジュールがプロジェクト外を参照しています。');
    await addModule(target);
  }
}
await addModule('script/main.js');
for(const file of await readdir(path.join(root,'data'))) if(file.endsWith('.json')) files.add('data/'+file);
for(const file of files) {const dest=path.join(output,file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,file),dest);}
console.log(`${files.size}ファイルを出力: ${output}`);
