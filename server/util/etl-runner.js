const { spawn } = require('child_process');
const path = require('path');

function runEtlForCustomer(customerName) {
  return new Promise((resolve, reject) => {
    const pythonPath = 'python3'; // or 'python' depending on env
    const scriptPath = path.join(__dirname, '..', 'etl_script.py');

    const child = spawn(pythonPath, [scriptPath, customerName]);

    child.stdout.on('data', (data) => {
      console.log(`[${customerName}] STDOUT: ${data}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`[${customerName}] STDERR: ${data}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ETL finished for ${customerName}`);
        resolve();
      } else {
        reject(new Error(`❌ ETL failed for ${customerName} (code ${code})`));
      }
    });
  });
}

module.exports = { runEtlForCustomer };
