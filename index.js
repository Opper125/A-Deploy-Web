// =====================================================
// OPPER DEPLOY PLATFORM - INDEX.JS
// With Multi-Page Navigation Support
// =====================================================

// Supabase Configuration
const SUPABASE_URL = "https://zrjfyaloaicrvkcfkpxf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyamZ5YWxvYWljcnZrY2ZrcHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MDAyOTAsImV4cCI6MjA3NTk3NjI5MH0.JszbKpjiP-jYgAthvdHBIn1atsFC5fs6SYIqssoN7cc";

const STORAGE_BUCKET = 'project-files';

let currentUser = null;
let currentProjectId = null;
let currentFileId = null;
let envVarCount = 0;
let sessionCheckInterval = null;

const SESSION_KEY = 'opper_deploy_session';
const SESSION_TIMESTAMP = 'opper_deploy_timestamp';

// =====================================================
// SESSION MANAGEMENT
// =====================================================

function saveSession(user) {
    try {
        const sessionData = {
            id: user.id,
            username: user.username,
            is_banned: user.is_banned,
            device_limit: user.device_limit,
            ip_address: user.ip_address,
            timestamp: Date.now()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        localStorage.setItem(SESSION_TIMESTAMP, Date.now().toString());
    } catch (error) {
        console.error('Session save error:', error);
    }
}

function getSession() {
    try {
        const sessionData = localStorage.getItem(SESSION_KEY);
        if (sessionData) {
            return JSON.parse(sessionData);
        }
    } catch (error) {
        console.error('Session get error:', error);
    }
    return null;
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_TIMESTAMP);
    } catch (error) {
        console.error('Session clear error:', error);
    }
}

async function validateSession(sessionData) {
    try {
        const users = await supabaseRequest(`users?id=eq.${sessionData.id}`);
        
        if (!users || users.length === 0) return false;
        
        const user = users[0];
        
        if (user.is_banned) return false;
        
        if (user.device_limit !== 999 && user.allowed_ips && user.allowed_ips.length > 0) {
            const currentIP = await getUserIP();
            if (!user.allowed_ips.includes(currentIP)) return false;
        }
        
        return user;
        
    } catch (error) {
        console.error('Session validation error:', error);
        return false;
    }
}

async function autoLogin() {
    const sessionData = getSession();
    
    if (!sessionData) return false;
    
    const user = await validateSession(sessionData);
    
    if (!user) {
        clearSession();
        return false;
    }
    
    try {
        await supabaseRequest(`users?id=eq.${user.id}`, 'PATCH', {
            last_login: new Date().toISOString()
        });
    } catch (error) {
        console.error('Last login update error:', error);
    }
    
    currentUser = user;
    showDashboard();
    
    return true;
}

function startSessionKeepAlive() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }
    
    sessionCheckInterval = setInterval(async () => {
        if (currentUser) {
            const sessionData = getSession();
            if (sessionData) {
                const isValid = await validateSession(sessionData);
                if (!isValid) {
                    logout();
                } else {
                    saveSession(currentUser);
                }
            }
        }
    }, 5 * 60 * 1000);
}

function stopSessionKeepAlive() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getUserIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('IP fetch error:', error);
        return 'unknown';
    }
}

async function supabaseRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    };

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const response = await fetch(url, options);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Database error occurred');
    }

    return method === 'DELETE' ? null : await response.json();
}

async function uploadToStorage(file, projectId, fileName) {
    try {
        const path = `${projectId}/${fileName}`;
        
        const response = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY
                },
                body: file
            }
        );
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }
        
        const publicURL = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
        return publicURL;
        
    } catch (error) {
        console.error('Storage upload error:', error);
        throw error;
    }
}

function getPublicURL(projectId, fileName) {
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${projectId}/${fileName}`;
}

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
        setTimeout(() => errorEl.classList.remove('show'), 5000);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// LOGIN/REGISTER HANDLER
// =====================================================

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    
    errorEl.classList.remove('show');

    if (!username || !password) {
        showError('loginError', '❌ Error: Username နှင့် Password လိုအပ်ပါသည်။');
        return;
    }

    if (username.length < 3) {
        showError('loginError', '❌ Error: Username သည် အနည်းဆုံး ၃ လုံးရှိရမည်။');
        return;
    }

    if (password.length < 6) {
        showError('loginError', '❌ Error: Password သည် အနည်းဆုံး ၆ လုံးရှိရမည်။');
        return;
    }

    try {
        const userIP = await getUserIP();
        const hashedPassword = await hashPassword(password);

        const existingUsers = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);

        if (existingUsers && existingUsers.length > 0) {
            const user = existingUsers[0];

            if (user.is_banned) {
                showError('loginError', '🚫 Error: သင့်အကောင့်ကို ပိတ်ထားပါသည်။ Admin နှင့်ဆက်သွယ်ပါ။');
                return;
            }

            if (user.password_hash !== hashedPassword) {
                showError('loginError', '❌ Error: Password မမှန်ကန်ပါ။');
                return;
            }

            if (user.device_limit !== 999 && user.allowed_ips && user.allowed_ips.length > 0) {
                if (!user.allowed_ips.includes(userIP)) {
                    showError('loginError', `🔒 Error: ဤ IP Address (${userIP}) မှ Login ဝင်ခွင့်မရှိပါ။`);
                    return;
                }
            }

            await supabaseRequest(`users?id=eq.${user.id}`, 'PATCH', {
                last_login: new Date().toISOString(),
                ip_address: userIP
            });

            await supabaseRequest('active_sessions', 'POST', {
                user_id: user.id,
                username: user.username,
                ip_address: userIP,
                user_agent: navigator.userAgent
            });

            currentUser = user;
            saveSession(user);
            startSessionKeepAlive();
            showDashboard();

        } else {
            const newUser = await supabaseRequest('users', 'POST', {
                username,
                password_hash: hashedPassword,
                ip_address: userIP,
                device_limit: 999,
                allowed_ips: []
            });

            if (newUser && newUser.length > 0) {
                await supabaseRequest('active_sessions', 'POST', {
                    user_id: newUser[0].id,
                    username: newUser[0].username,
                    ip_address: userIP,
                    user_agent: navigator.userAgent
                });

                currentUser = newUser[0];
                saveSession(newUser[0]);
                startSessionKeepAlive();
                showDashboard();
            }
        }

    } catch (error) {
        console.error('Login error:', error);
        showError('loginError', `❌ Error: ${error.message}`);
    }
});

// =====================================================
// DASHBOARD FUNCTIONS
// =====================================================

function showDashboard() {
    document.getElementById('loginSection').classList.remove('active');
    document.getElementById('dashboardSection').classList.add('active');
    document.getElementById('userDisplay').textContent = `👤 ${currentUser.username}`;
    loadProjects();
}

function logout() {
    stopSessionKeepAlive();
    clearSession();
    currentUser = null;
    document.getElementById('dashboardSection').classList.remove('active');
    document.getElementById('loginSection').classList.add('active');
    document.getElementById('loginForm').reset();
}

async function loadProjects() {
    try {
        const projects = await supabaseRequest(`projects?user_id=eq.${currentUser.id}&order=created_at.desc`);
        
        const projectsList = document.getElementById('projectsList');
        
        if (!projects || projects.length === 0) {
            projectsList.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                    <h2 style="font-size: 3rem; margin-bottom: 16px;">🚀</h2>
                    <h3>No projects yet</h3>
                    <p>Create your first project to get started</p>
                </div>
            `;
            return;
        }

        // Load files for each project to show page links
        const projectsWithFiles = await Promise.all(projects.map(async (project) => {
            try {
                const files = await supabaseRequest(`project_files?project_id=eq.${project.id}&select=file_name`);
                const htmlFiles = files.filter(f => f.file_name.toLowerCase().endsWith('.html'));
                return { ...project, htmlFiles };
            } catch (error) {
                return { ...project, htmlFiles: [] };
            }
        }));

        projectsList.innerHTML = projectsWithFiles.map(project => {
            const viewerURL = `${window.location.origin}/viewer.html?project=${project.id}`;
            
            // Generate page links
            let pageLinks = '';
            if (project.htmlFiles && project.htmlFiles.length > 1) {
                pageLinks = `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                        <small style="color: var(--text-secondary);">📄 Pages:</small>
                        <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                            ${project.htmlFiles.map(file => {
                                const pageURL = `${viewerURL}&file=${file.file_name}`;
                                const pageName = file.file_name.replace('.html', '');
                                return `<a href="${pageURL}" target="_blank" style="
                                    padding: 4px 12px; 
                                    background: var(--bg-color); 
                                    border-radius: 4px; 
                                    font-size: 0.85rem;
                                    color: var(--primary-color);
                                    text-decoration: none;
                                    border: 1px solid var(--border-color);
                                ">${pageName}</a>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
            
            return `
            <div class="project-card">
                <div class="project-header">
                    <div>
                        <h3>${escapeHtml(project.project_name)}</h3>
                        <p class="project-domain">
                            <a href="${viewerURL}" target="_blank">
                                🌐 ${escapeHtml(project.domain_name)}
                            </a>
                        </p>
                    </div>
                    <span class="status-badge ${project.status}">${project.status}</span>
                </div>
                <div class="project-info">
                    <p>📅 Created: ${new Date(project.created_at).toLocaleDateString('my-MM')}</p>
                    <p>🔄 Deploys: ${project.deploy_count}</p>
                    <p>📄 Files: ${project.htmlFiles.length} HTML pages</p>
                    ${pageLinks}
                </div>
                <div class="project-actions">
                    <button onclick="copyProjectURL('${viewerURL}')" class="btn btn-secondary btn-sm">📋 Copy URL</button>
                    <button onclick="editProject('${project.id}')" class="btn btn-secondary btn-sm">✏️ Edit</button>
                    <button onclick="deleteProject('${project.id}', '${escapeHtml(project.project_name)}')" class="btn btn-danger btn-sm">🗑️ Delete</button>
                </div>
            </div>
        `}).join('');

    } catch (error) {
        console.error('Load projects error:', error);
    }
}

function copyProjectURL(url) {
    navigator.clipboard.writeText(url).then(() => {
        alert('✅ URL copied to clipboard!\n\n' + url);
    }).catch(err => {
        prompt('Copy this URL:', url);
    });
}

// =====================================================
// PROJECT MODAL FUNCTIONS
// =====================================================

function showNewProjectModal() {
    document.getElementById('newProjectModal').classList.add('show');
    document.getElementById('newProjectForm').reset();
    document.getElementById('envVariables').innerHTML = '';
    document.getElementById('filesList').innerHTML = '';
    envVarCount = 0;
}

function closeNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('show');
}

document.getElementById('domainName')?.addEventListener('input', (e) => {
    const domain = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    e.target.value = domain;
    document.getElementById('domainPreview').textContent = `${domain || 'yoursite'}.opper.mmr`;
});

document.getElementById('projectFiles')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const filesList = document.getElementById('filesList');
    const filesError = document.getElementById('filesError');
    
    filesError.classList.remove('show');
    
    let totalSize = 0;
    let hasError = false;
    let htmlCount = 0;
    
    const filesHTML = files.map(file => {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        totalSize += file.size;
        
        if (file.name.toLowerCase().endsWith('.html')) {
            htmlCount++;
        }
        
        if (file.size > 1024 * 1024) {
            hasError = true;
            return `
                <div class="file-item" style="border: 1px solid var(--danger-color);">
                    <div class="file-info">
                        <div class="file-name">❌ ${escapeHtml(file.name)}</div>
                        <div class="file-size">${sizeInMB} MB (Too large!)</div>
                    </div>
                </div>
            `;
        }
        
        const icon = file.name.toLowerCase().endsWith('.html') ? '📄' : 
                     file.name.toLowerCase().endsWith('.css') ? '🎨' :
                     file.name.toLowerCase().endsWith('.js') ? '⚙️' : '📎';
        
        return `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">${icon} ${escapeHtml(file.name)}</div>
                    <div class="file-size">${sizeInMB} MB</div>
                </div>
            </div>
        `;
    }).join('');
    
    filesList.innerHTML = filesHTML;
    
    if (htmlCount > 1) {
        filesList.innerHTML += `<div style="padding: 12px; background: var(--bg-color); border-radius: 6px; margin-top: 8px; color: var(--success-color);">
            ✅ Detected ${htmlCount} HTML pages - Multi-page navigation will be enabled!
        </div>`;
    }
    
    if (hasError) {
        showError('filesError', '❌ Error: ဖိုင်တစ်ခုချင်းသည် 1MB ထက်မကျော်ရပါ။');
        e.target.value = '';
        return;
    }
    
    if (totalSize > 10 * 1024 * 1024) {
        showError('filesError', `❌ Error: စုစုပေါင်းဖိုင်အရွယ်အစား ${(totalSize / (1024 * 1024)).toFixed(2)} MB သည် 10MB ထက်ကျော်လွန်နေပါသည်။`);
        e.target.value = '';
        return;
    }
});

function addEnvVariable() {
    envVarCount++;
    const envDiv = document.getElementById('envVariables');
    const newRow = document.createElement('div');
    newRow.className = 'env-row';
    newRow.id = `env-${envVarCount}`;
    newRow.innerHTML = `
        <input type="text" placeholder="KEY" class="env-key">
        <input type="text" placeholder="VALUE" class="env-value">
        <button type="button" onclick="removeEnvVariable('env-${envVarCount}')" class="btn btn-danger btn-sm">✖</button>
    `;
    envDiv.appendChild(newRow);
}

function removeEnvVariable(id) {
    document.getElementById(id)?.remove();
}

document.getElementById('newProjectForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const projectName = document.getElementById('projectName').value.trim();
    const domainName = document.getElementById('domainName').value.trim().toLowerCase();
    const files = document.getElementById('projectFiles').files;
    
    const deployProgress = document.getElementById('deployProgress');
    const deployBtn = document.getElementById('deployBtn');
    
    if (!domainName) {
        alert('❌ Domain name လိုအပ်ပါသည်။');
        return;
    }
    
    if (!files || files.length === 0) {
        alert('❌ အနည်းဆုံး ဖိုင်တစ်ခု upload လုပ်ရန်လိုအပ်ပါသည်။');
        return;
    }
    
    deployBtn.disabled = true;
    deployProgress.classList.add('show');
    deployProgress.innerHTML = '<div class="progress-step">🔄 Starting deployment...</div>';
    
    try {
        const existingDomain = await supabaseRequest(`projects?domain_name=eq.${domainName}.opper.mmr`);
        if (existingDomain && existingDomain.length > 0) {
            throw new Error('ဤ Domain name ကို အသုံးပြုပြီးသားဖြစ်ပါသည်။');
        }
        
        deployProgress.innerHTML += '<div class="progress-step">✅ Domain validated</div>';
        
        const project = await supabaseRequest('projects', 'POST', {
            user_id: currentUser.id,
            username: currentUser.username,
            project_name: projectName || domainName,
            domain_name: `${domainName}.opper.mmr`,
            status: 'deploying'
        });
        
        deployProgress.innerHTML += '<div class="progress-step">✅ Project created</div>';
        
        const projectId = project[0].id;
        
        deployProgress.innerHTML += '<div class="progress-step">📤 Uploading files...</div>';
        
        for (let file of files) {
            const content = await readFileAsText(file);
            
            try {
                const storageURL = await uploadToStorage(file, projectId, file.name);
                
                await supabaseRequest('project_files', 'POST', {
                    project_id: projectId,
                    file_name: file.name,
                    file_content: content,
                    file_size: file.size,
                    file_type: file.type || 'text/plain',
                    storage_url: storageURL
                });
                
                deployProgress.innerHTML += `<div class="progress-step">✅ ${file.name}</div>`;
            } catch (uploadError) {
                await supabaseRequest('project_files', 'POST', {
                    project_id: projectId,
                    file_name: file.name,
                    file_content: content,
                    file_size: file.size,
                    file_type: file.type || 'text/plain'
                });
                
                deployProgress.innerHTML += `<div class="progress-step">⚠️ ${file.name} (database only)</div>`;
            }
        }
        
        const envRows = document.querySelectorAll('.env-row');
        for (let row of envRows) {
            const key = row.querySelector('.env-key').value.trim();
            const value = row.querySelector('.env-value').value.trim();
            
            if (key && value) {
                await supabaseRequest('env_variables', 'POST', {
                    project_id: projectId,
                    key,
                    value
                });
            }
        }
        
        await supabaseRequest(`projects?id=eq.${projectId}`, 'PATCH', {
            status: 'active',
            updated_at: new Date().toISOString()
        });
        
        await supabaseRequest('deployment_logs', 'POST', {
            project_id: projectId,
            user_id: currentUser.id,
            action: 'deploy',
            status: 'success',
            message: 'Project deployed successfully'
        });
        
        deployProgress.innerHTML += '<div class="progress-step success">🎉 Deployment successful!</div>';
        
        const viewerURL = `${window.location.origin}/viewer.html?project=${projectId}`;
        deployProgress.innerHTML += `<div class="progress-step success">🌐 <a href="${viewerURL}" target="_blank">${domainName}.opper.mmr</a></div>`;
        
        setTimeout(() => {
            closeNewProjectModal();
            loadProjects();
        }, 3000);
        
    } catch (error) {
        console.error('Deploy error:', error);
        deployProgress.innerHTML += `<div class="progress-step error">❌ Error: ${error.message}</div>`;
        deployBtn.disabled = false;
    }
});

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// =====================================================
// EDIT PROJECT FUNCTIONS
// =====================================================

async function editProject(projectId) {
    currentProjectId = projectId;
    
    try {
        const project = await supabaseRequest(`projects?id=eq.${projectId}`);
        const files = await supabaseRequest(`project_files?project_id=eq.${projectId}&order=file_name.asc`);
        
        document.getElementById('editProjectName').textContent = project[0].project_name;
        document.getElementById('editProjectDomain').textContent = project[0].domain_name;
        document.getElementById('editProjectStatus').textContent = `Status: ${project[0].status}`;
        
        const filesListHTML = files.map(file => `
            <div class="edit-file-item">
                <div class="file-info">
                    <div class="file-name">📄 ${escapeHtml(file.file_name)}</div>
                    <div class="file-size">${(file.file_size / 1024).toFixed(2)} KB</div>
                </div>
                <button onclick="editFile('${file.id}', '${escapeHtml(file.file_name)}')" class="btn btn-primary btn-sm">Edit</button>
            </div>
        `).join('');
        
        document.getElementById('editFilesList').innerHTML = filesListHTML || '<p>No files found</p>';
        document.getElementById('editProjectModal').classList.add('show');
        
    } catch (error) {
        console.error('Edit project error:', error);
        alert('Error loading project');
    }
}

function closeEditModal() {
    document.getElementById('editProjectModal').classList.remove('show');
}

async function editFile(fileId, fileName) {
    currentFileId = fileId;
    
    try {
        const file = await supabaseRequest(`project_files?id=eq.${fileId}`);
        
        document.getElementById('editFileName').textContent = fileName;
        document.getElementById('fileContentEditor').value = file[0].file_content || '';
        document.getElementById('fileEditorModal').classList.add('show');
        
    } catch (error) {
        console.error('Edit file error:', error);
        alert('Error loading file');
    }
}

function closeFileEditor() {
    document.getElementById('fileEditorModal').classList.remove('show');
}

async function saveFileChanges() {
    const newContent = document.getElementById('fileContentEditor').value;
    const saveProgress = document.getElementById('saveProgress');
    
    saveProgress.classList.add('show');
    saveProgress.innerHTML = '<div class="progress-step">🔄 Saving changes...</div>';
    
    try {
        const fileData = await supabaseRequest(`project_files?id=eq.${currentFileId}`);
        const file = fileData[0];
        
        await supabaseRequest(`project_files?id=eq.${currentFileId}`, 'PATCH', {
            file_content: newContent,
            file_size: new Blob([newContent]).size,
            updated_at: new Date().toISOString()
        });
        
        saveProgress.innerHTML += '<div class="progress-step">✅ Database updated</div>';
        
        if (file.storage_url) {
            try {
                const path = `${file.project_id}/${file.file_name}`;
                
                await fetch(
                    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                            'apikey': SUPABASE_ANON_KEY,
                            'Content-Type': file.file_type || 'text/plain'
                        },
                        body: newContent
                    }
                );
                
                saveProgress.innerHTML += '<div class="progress-step">✅ Storage updated</div>';
            } catch (storageError) {
                saveProgress.innerHTML += '<div class="progress-step error">⚠️ Storage update failed</div>';
            }
        }
        
        const projectId = file.project_id;
        const project = await supabaseRequest(`projects?id=eq.${projectId}`);
        
        await supabaseRequest(`projects?id=eq.${projectId}`, 'PATCH', {
            updated_at: new Date().toISOString(),
            deploy_count: project[0].deploy_count + 1
        });
        
        await supabaseRequest('deployment_logs', 'POST', {
            project_id: projectId,
            user_id: currentUser.id,
            action: 'redeploy',
            status: 'success',
            message: `File updated: ${file.file_name}`
        });
        
        saveProgress.innerHTML += '<div class="progress-step success">🎉 Saved & redeployed!</div>';
        
        setTimeout(() => {
            closeFileEditor();
            closeEditModal();
            loadProjects();
        }, 1500);
        
    } catch (error) {
        console.error('Save file error:', error);
        saveProgress.innerHTML += `<div class="progress-step error">❌ Error: ${error.message}</div>`;
    }
}

async function deleteProject(projectId, projectName) {
    if (!confirm(`သင် "${projectName}" ကို ဖျက်ရန် သေချာပါသလား?`)) {
        return;
    }
    
    try {
        await supabaseRequest(`projects?id=eq.${projectId}`, 'DELETE');
        
        alert('✅ Project ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ။');
        loadProjects();
        
    } catch (error) {
        console.error('Delete project error:', error);
        alert('❌ Error: Project ဖျက်ရာတွင် အမှားအယွင်းရှိနေပါသည်။');
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Opper Deploy Platform Initialized');
    
    const loggedIn = await autoLogin();
    
    if (!loggedIn) {
        console.log('ℹ️ No active session, showing login page');
    }
});

document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && currentUser) {
        const sessionData = getSession();
        if (sessionData) {
            const isValid = await validateSession(sessionData);
            if (!isValid) {
                logout();
            }
        }
    }
});

window.addEventListener('beforeunload', () => {
    if (currentUser) {
        saveSession(currentUser);
    }
});
