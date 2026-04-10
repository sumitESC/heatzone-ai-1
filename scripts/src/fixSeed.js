import fs from 'fs';
const seedFile = 'd:/code/Heat-Zone-Intel/scripts/src/seedData.ts';
let content = fs.readFileSync(seedFile, 'utf-8');

// replace ndvi: 0.xx, with ndvi: 0.xx, ndbi: 0.yy, emissionIndex: z.zz,
content = content.replace(/ndvi: ([0-9.]+),/g, (match, ndvi) => {
    const ndbi = (Math.random() * 0.2 + 0.1).toFixed(2);
    const emission = (Math.random() * 4 + 1).toFixed(2);
    return `ndvi: ${ndvi}, ndbi: ${ndbi}, emissionIndex: ${emission},`;
});

fs.writeFileSync(seedFile, content, 'utf-8');
console.log('Successfully updated seedData.ts with mock ndbi and emissionIndex!');
