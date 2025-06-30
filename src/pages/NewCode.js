import Editor, { useMonaco } from "@monaco-editor/react";
import '../App.css';
import { useContext, useEffect, useState, useCallback } from 'react';
import { CodeContext } from '../contexts/CodeContext';

function NewCode() {
    const {
        langs, stdin, setStdin, stdout, setStdout, code, setCode,
        stderr, setStderr, flags, setFlags, stdinActive, setStdinActive,
        langId, stdoutActive, setStdoutActive,
    } = useContext(CodeContext);

    const monaco = useMonaco();
    const [editor, setEditor] = useState(null);
    const runCode = useCallback(() => {
        const data = {
            code,
            stdin,
            flags
        };
        console.log(data);
        fetch('http://localhost:8000/run-cpp', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { "Content-Type": "application/json" },
            credentials: 'include'
        })
        .then(res => res.json())
        .then(resp => {
            if (resp.status === 200) {
                console.log('Successfully Ran.', resp);
            } else {
                console.log('Error while running !!', resp.stderr);
            }
            setStderr(resp.stderr);
            setStdout(resp.stdout);
        });
    }, [code, stdin, flags, setStderr, setStdout]);

    const addCmd = useCallback(() => {
        if (!editor || !monaco) return;
        editor.addCommand(
            monaco.KeyMod.CtrlCmd + monaco.KeyCode.Enter,
            runCode
        );
        editor.addCommand(
            monaco.KeyMod.CtrlCmd + monaco.KeyCode.Shift,
            () => setStdoutActive(prev => !prev)
        );
    }, [editor, monaco, runCode, setStdoutActive]);

    useEffect(() => {
        addCmd();
    }, [addCmd]);

    useEffect(() => {
        console.log(code);
    }, [code]);

    useEffect(() => {
        const handleShortcutKeys = evt => {
            if (evt.ctrlKey) {
                if (evt.key === 'Enter') {
                    runCode();
                } else if (evt.key === 'Shift') {
                    setStdoutActive(prev => !prev);
                }
            }
        };
        window.addEventListener("keyup", handleShortcutKeys);
        return () => {
            window.removeEventListener("keyup", handleShortcutKeys);
        };
    }, [runCode, setStdoutActive]);

    const codeChanged = (value) => {
        setCode(value);
    };

    return (
        <div className="d-flex flex-column vh-100">
        {/* Header */}
        <div className='Header'>
          <div className="logo">CodeLab</div>
          <button onClick={runCode} className="btn btn-primary">
            <span>▶</span> Run Code
          </button>
        </div>

        {/* Body */}
        <div className='Body'>
          {/* Editor */}
          <div className="Editor">
            <Editor
              height="100%"
              defaultLanguage={langs[langId]}
              defaultValue={code}
              theme="vs-dark"
              width="100%"
              onChange={codeChanged}
              onMount={(edit) => setEditor(edit)}
            />
          </div>

          {/* Sidebar */}
          <div className='Sidebar'>
            {/* Input Section */}
            <div>
              <div className="toggle-label">Input</div>
              <div className="toggle-section">
                <button
                  className={`editor-btn ${stdinActive ? 'active' : ''}`}
                  onClick={() => setStdinActive(true)}
                >
                  STDIN
                </button>
                <span className="separator">|</span>
                <button
                  className={`editor-btn ${!stdinActive ? 'active' : ''}`}
                  onClick={() => setStdinActive(false)}
                >
                  FLAGS
                </button>
              </div>
              
              {/* Input Fields */}
              <div className="io-container">
                {stdinActive ? (
                  <div className='stdin'>
                    <textarea 
                      value={stdin} 
                      onChange={e => setStdin(e.target.value)}
                      placeholder="Enter your input data here..."
                    />
                  </div>
                ) : (
                  <div className='flags'>
                    <textarea 
                      value={flags} 
                      onChange={e => setFlags(e.target.value)}
                      placeholder="Enter compiler flags here..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Output Section */}
            <div>
              <div className="toggle-label">Output</div>
              <div className="toggle-section">
                <button
                  className={`editor-btn ${stdoutActive ? 'active' : ''}`}
                  onClick={() => setStdoutActive(true)}
                >
                  STDOUT
                </button>
                <span className="separator">|</span>
                <button
                  className={`editor-btn ${!stdoutActive ? 'active' : ''}`}
                  onClick={() => setStdoutActive(false)}
                >
                  STDERR
                </button>
              </div>
              
              {/* Output Fields */}
              <div className="io-container">
                {stdoutActive ? (
                  <div className='stdout'>
                    <div className="content">{stdout || 'No output yet...'}</div>
                  </div>
                ) : (
                  <div className='stderr'>
                    <div className="content">{stderr || 'No errors...'}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className='Footer'>
          🚀 Collaborative Code Session • Build something amazing
        </div>
      </div>
    );
  }
  
export default NewCode;
        // <div>
        //     <div className='Header'>
        //         <button onClick={runCode}>Run Code</button>
        //     </div>
        //     <div className='Body'>
        //         <div className="Editor">
        //             <Editor
        //                 height="94vh"
        //                 defaultLanguage={langs[langId]}
        //                 defaultValue={code}
        //                 theme='vs-dark'
        //                 width="auto"
        //                 onChange={codeChanged}
        //                 onMount={(edit) => setEditor(edit)}
        //             />
        //         </div>
        //         <div className='Sidebar'>
        //             <div>
        //                 <button
        //                     style={{ color: stdinActive ? activeGreen : inactiveGreen }}
        //                     className='editor-btn'
        //                     onClick={() => setStdinActive(!stdinActive)}
        //                 >
        //                     STDIN
        //                 </button> | 
        //                 <button
        //                     style={{ color: !stdinActive ? activeGreen : inactiveGreen }}
        //                     className='editor-btn'
        //                     onClick={() => setStdinActive(!stdinActive)}
        //                 >
        //                     FLAGS
        //                 </button>
        //             </div>
        //             {
        //                 stdinActive ? (
        //                     <div className='stdin'>
        //                         <textarea value={stdin} onChange={e => setStdin(e.target.value)} />
        //                     </div>
        //                 ) : (
        //                     <div className='flags'>
        //                         <textarea value={flags} onChange={e => setFlags(e.target.value)} />
        //                     </div>
        //                 )
        //             }
        //             <div>
        //                 <button
        //                     style={{ color: stdoutActive ? activeGreen : inactiveGreen }}
        //                     className='editor-btn'
        //                     onClick={() => setStdoutActive(!stdoutActive)}
        //                 >
        //                     STDOUT
        //                 </button> | 
        //                 <button
        //                     style={{ color: !stdoutActive ? activeGreen : inactiveGreen }}
        //                     className='editor-btn'
        //                     onClick={() => setStdoutActive(!stdoutActive)}
        //                 >
        //                     STDERR
        //                 </button>
        //             </div>
        //             {
        //                 stdoutActive ? (
        //                     <div className='stdout'>{stdout}</div>
        //                 ) : (
        //                     <div className='stderr'>{stderr}</div>
        //                 )
        //             }
        //         </div>
        //     </div>
        //     <div className='Footer'></div>
        // </div>

