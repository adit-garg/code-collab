// import { CodeContext } from './contexts/CodeContext';
const { exec, spawn } = require("child_process");
const fs = require('fs');
const { useContext } = require("react");

// export const RunCPP = (code, stdin, flags) => {
//   console.log("started");
//   let dir_path = './temp/' + Date.now();
//   return fs.mkdir(dir_path, { recursive: true }, err => {
//     console.log("mkdir", err);
//     return fs.writeFile(dir_path + '/main.cpp', code, err => {
//       console.log("write", err);
//       return exec("g++ " + flags + ' ' + dir_path + "/main.cpp -o " + dir_path + "/a", flags, (error, stdout, stderr) => {
//         if (error) {
//           console.log(`error: ${error.message}`);
//           return;
//         }
//         if (stderr) {
//           console.log(`stderr: ${stderr}`);
//         }
//         const child = spawn(dir_path + "/a"); //where a is the exe file generated on compiling the code.
//         child.stdin.write(stdin);
//         child.stdin.end();
//         return child.stdout.on("data", (data) => {
//           console.log(`child stdout:\n${data}`);
//           return {
//             stderr: stderr,
//             stdout: data
//           };
//         });
//       });  
//     })
//   });
// };
export const RunCPP = (code, stdin, flags, callback) => {
  let dir_path = './temp/' + Date.now();

  fs.mkdir(dir_path, { recursive: true }, err => {
    if (err) return callback({ status: 500, stderr: "mkdir failed", stdout: "" });

    fs.writeFile(`${dir_path}/main.cpp`, code, err => {
      if (err) return callback({ status: 500, stderr: "write failed", stdout: "" });

      exec(`g++ ${flags} ${dir_path}/main.cpp -o ${dir_path}/a`, (error, stdout, stderr) => {
        if (error || stderr) {
          fs.rmSync(dir_path, { recursive: true, force: true });
          return callback({ status: 400, stderr: stderr || error.message, stdout: "" });
        }

        const child = spawn(`${dir_path}/a`);
        let output = "";

        child.stdin.write(stdin);
        child.stdin.end();

        child.stdout.on("data", data => {
          output += data.toString();
        });

        child.on("close", () => {
          fs.rmSync(dir_path, { recursive: true, force: true });
          callback({ status: 200, stderr: "", stdout: output });
        });

        setTimeout(() => {
          child.kill();
          fs.rmSync(dir_path, { recursive: true, force: true });
          callback({ status: 408, stderr: "Execution timeout", stdout: output });
        }, 10000);
      });
    });
  });
};

