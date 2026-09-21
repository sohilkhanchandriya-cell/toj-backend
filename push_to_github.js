const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');
const path = require('path');

async function main() {
  const token = process.argv[2];
  const repoName = process.argv[3] || 'toj-backend';
  const owner = 'sohilkhanchandriya-cell';

  if (!token) {
    console.error('Usage: node push_to_github.js <GITHUB_PERSONAL_ACCESS_TOKEN>');
    process.exit(1);
  }

  const dir = path.resolve(__dirname);
  console.log('1. Initializing Git repository in:', dir);
  await git.init({ fs, dir });

  console.log('2. Staging files (respecting .gitignore)...');
  // Read gitignore
  const gitignoreContent = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  const ignoreList = gitignoreContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  function shouldIgnore(relPath) {
    const norm = relPath.replace(/\\/g, '/');
    for (const rule of ignoreList) {
      const cleanRule = rule.replace(/\/$/, '');
      if (norm === cleanRule || norm.startsWith(cleanRule + '/')) {
        return true;
      }
    }
    if (norm.startsWith('.git') || norm.includes('node_modules') || norm.includes('uploads')) return true;
    return false;
  }

  function walk(currentDir, baseDir) {
    let result = [];
    const list = fs.readdirSync(currentDir);
    for (const item of list) {
      const fullPath = path.join(currentDir, item);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      if (shouldIgnore(relPath)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        result = result.concat(walk(fullPath, baseDir));
      } else {
        result.push(relPath);
      }
    }
    return result;
  }

  const filesToAdd = walk(dir, dir);
  console.log(`Found ${filesToAdd.length} files to commit.`);

  for (const file of filesToAdd) {
    await git.add({ fs, dir, filepath: file });
  }

  console.log('3. Committing files...');
  const sha = await git.commit({
    fs,
    dir,
    author: {
      name: 'Sohil Khan Chandriya',
      email: 'sohil@tojapp.local',
    },
    message: 'Deploy TOJ Reels Backend with Cloudinary & 24/7 Cloud Architecture',
  });
  console.log('Committed commit SHA:', sha);

  const remoteUrl = `https://github.com/${owner}/${repoName}.git`;
  console.log('4. Pushing to GitHub remote:', remoteUrl);

  try {
    await git.addRemote({
      fs,
      dir,
      remote: 'origin',
      url: remoteUrl,
      force: true,
    });
  } catch (_) {}

  const pushResult = await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: 'main',
    force: true,
    onAuth: () => ({ username: token, password: '' }),
  });

  console.log('Push complete!', pushResult);
}

main().catch(err => {
  console.error('Push failed with error:', err);
  process.exit(1);
});
