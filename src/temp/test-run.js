const { exec, spawn } = require("child_process");
const fs = require('fs');

const data = {
  code: `#include <iostream>
using namespace std;

int main() {
  #ifdef VRINTLE
    cout << "Hello World";
    #endif
}`,
  stdin: '123',
  flags: '-Wall -std=c++17 -DVRINTLE',
  dir: 'ijdebgueh983'
};

fs.mkdir('./' + data.dir, { recursive: true }, err => {
  console.log("mkdir", err);
  fs.writeFile('./' + data.dir + '/main.cpp', data.code, err => {
    console.log("write", err);
    exec("g++ " + data.flags + ' ./' + data.dir + "/main.cpp -o ./" + data.dir + "/a", data.flags, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
      }    
      const child = spawn("./" + data.dir + "/a"); //where a is the exe file generated on compiling the code.
      child.stdin.write(data.stdin);
      child.stdin.end();
      child.stdout.on("data", (data) => {
        console.log(`child stdout:\n${data}`);
      });
    });  
  })
});
