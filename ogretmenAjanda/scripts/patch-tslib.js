const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already patched
  if (content.includes('exporter("default"') || content.includes('exports.default =')) {
    console.log('ℹ️ Already patched:', filePath);
    return;
  }

  // CommonJS tslib.js:
  // We want to add exporter("default", root) or exporter("default", { __extends, ... })
  if (filePath.endsWith('tslib.js')) {
    const target1 = 'exporter("__classPrivateFieldSet", __classPrivateFieldSet);';
    if (content.includes(target1)) {
      content = content.replace(target1, `${target1}
    exporter("default", {
        __extends: __extends,
        __assign: __assign,
        __rest: __rest,
        __decorate: __decorate,
        __param: __param,
        __metadata: typeof __metadata !== "undefined" ? __metadata : undefined,
        __awaiter: __awaiter,
        __generator: __generator,
        __exportStar: __exportStar,
        __createBinding: typeof __createBinding !== "undefined" ? __createBinding : undefined,
        __values: __values,
        __read: __read,
        __spread: __spread,
        __spreadArrays: typeof __spreadArrays !== "undefined" ? __spreadArrays : undefined,
        __await: __await,
        __asyncGenerator: __asyncGenerator,
        __asyncDelegator: __asyncDelegator,
        __asyncValues: __asyncValues,
        __makeTemplateObject: __makeTemplateObject,
        __importStar: __importStar,
        __importDefault: __importDefault,
        __classPrivateFieldGet: __classPrivateFieldGet,
        __classPrivateFieldSet: __classPrivateFieldSet
    });`);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('✅ Patched with exporter("default"):', filePath);
      return;
    }
  }
}

function walk(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== '.git') {
        walk(full);
      } else if (e.name === 'tslib.js') {
        patchFile(full);
      }
    }
  } catch (err) {}
}

const nm = path.resolve(__dirname, '../node_modules');
walk(nm);
console.log('Finished checking all tslib instances in node_modules.');
