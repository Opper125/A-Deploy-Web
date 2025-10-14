// Supabase Configuration
const SUPABASE_URL = "https://zrjfyaloaicrvkcfkpxf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyamZ5YWxvYWljcnZrY2ZrcHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MDAyOTAsImV4cCI6MjA3NTk3NjI5MH0.JszbKpjiP-jYgAthvdHBIn1atsFC5fs6SYIqssoN7cc";

// Global Variables
let currentUser = null;
let currentProjectId = null;
let currentFileId = null;
let envVarCount = 0;

// Simple Hash Function (SHA-256 simulation)
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get User IP Address
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

// Supabase API Helper
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

// Show Error Message
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 5000);
}

// Login/Register Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
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

        // Check if user exists
        const existingUsers = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);

        if (existingUsers && existingUsers.length > 0) {
            const user = existingUsers[0];

            // Check if banned
            if (user.is_banned) {
                showError('loginError', '🚫 Error: သင့်အကောင့်ကို ပိတ်ထားပါသည်။ Admin နှင့်ဆက်သွယ်ပါ။');
                return;
            }

            // Check password
            if (user.password_hash !== hashedPassword) {
                showError('loginError', '❌ Error: Password မမှန်ကန်ပါ။');
                return;
            }

            // Check device limit
            if (user.device_limit !== 999 && user.allowed_ips && user.allowed_ips.length > 0) {
                if (!user.allowed_ips.includes(userIP)) {
                    showError('loginError', `🔒 Error: ဤ IP Address (${userIP}) မှ Login ဝင်ခွင့်မရှိပါ။ သင့်အကောင့်ကို ${user.device_limit} Device သက်မှတ်ထားပါသည်။`);
                    return;
                }
            }

            // Update last login and IP
            await supabaseRequest(`users?id=eq.${user.id}`, 'PATCH', {
                last_login: new Date().toISOString(),
                ip_address: userIP
            });

            // Create active session
            await supabaseRequest('active_sessions', 'POST', {
                user_id: user.id,
                username: user.username,
                ip_address: userIP,
                user_agent: navigator.userAgent
            });

            currentUser = user;
            showDashboard();

        } else {
            // Create new user
            const newUser = await supabaseRequest('users', 'POST', {
                username,
                password_hash: hashedPassword,
                ip_address: userIP,
                device_limit: 999,
                allowed_ips: []
            });

            if (newUser && newUser.length > 0) {
                // Create session
                await supabaseRequest('active_sessions', 'POST', {
                    user_id: newUser[0].id,
                    username: newUser[0].username,
                    ip_address: userIP,
                    user_agent: navigator.userAgent
                });

                currentUser = newUser[0];
                showDashboard();
            }
        }

    } catch (error) {
        console.error('Login error:', error);
        showError('loginError', `❌ Error: ${error.message}`);
    }
});

// Show Dashboard
function showDashboard() {
    document.getElementById('loginSection').classList.remove('active');
    document.getElementById('dashboardSection').classList.add('active');
    document.getElementById('userDisplay').textContent = `👤 ${currentUser.username}`;
    loadProjects();
}

// Logout
function logout() {
    currentUser = null;
    document.getElementById('dashboardSection').classList.remove('active');
    document.getElementById('loginSection').classList.add('active');
    document.getElementById('loginForm').reset();
}

// Load Projects
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

        projectsList.innerHTML = projects.map(project => `
            <div class="project-card">
                <div class="project-header">
                    <div>
                        <h3>${escapeHtml(project.project_name)}</h3>
                        <p class="project-domain">
                            <a href="https://${escapeHtml(project.domain_name)}" target="_blank">
                                ${escapeHtml(project.domain_name)}
                            </a>
                        </p>
                    </div>
                    <span class="status-badge ${project.status}">${project.status}</span>
                </div>
                <div class="project-info">
                    <p>📅 Created: ${new Date(project.created_at).toLocaleDateString('my-MM')}</p>
                    <p>🔄 Deploys: ${project.deploy_count}</p>
                    <p>🕒 Updated: ${new Date(project.updated_at).toLocaleString('my-MM')}</p>
                </div>
                <div class="project-actions">
                    <button onclick="editProject('${project.id}')" class="btn btn-secondary btn-sm">✏️ Edit</button>
                    <button onclick="deleteProject('${project.id}', '${escapeHtml(project.project_name)}')" class="btn btn-danger btn-sm">🗑️ Delete</button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Load projects error:', error);
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show New Project Modal
function showNewProjectModal() {
    document.getElementById('newProjectModal').classList.add('show');
    document.getElementById('newProjectForm').reset();
    document.getElementById('envVariables').innerHTML = '';
    document.getElementById('filesList').innerHTML = '';
    envVarCount = 0;
}

// Close New Project Modal
function closeNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('show');
}

// Domain Preview
document.getElementById('domainName')?.addEventListener('input', (e) => {
    const domain = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    e.target.value = domain;
    document.getElementById('domainPreview').textContent = `${domain || 'yoursite'}.opper.mmr`;
});

// File Upload Handler
document.getElementById('projectFiles')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const filesList = document.getElementById('filesList');
    const filesError = document.getElementById('filesError');
    
    filesError.classList.remove('show');
    
    let totalSize = 0;
    let hasError = false;
    
    const filesHTML = files.map(file => {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        totalSize += file.size;
        
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
        
        return `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">📄 ${escapeHtml(file.name)}</div>
                    <div class="file-size">${sizeInMB} MB</div>
                </div>
            </div>
        `;
    }).join('');
    
    filesList.innerHTML = filesHTML;
    
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

// Add Environment Variable
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

// Deploy Project
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
    deployProgress.innerHTML = '<div class="progress-step">🔄 Deploying...</div>';
    
    try {
        // Check if domain exists
        const existingDomain = await supabaseRequest(`projects?domain_name=eq.${domainName}.opper.mmr`);
        if (existingDomain && existingDomain.length > 0) {
            throw new Error('ဤ Domain name ကို အသုံးပြုပြီးသားဖြစ်ပါသည်။ အခြား Domain name ရွေးချယ်ပါ။');
        }
        
        deployProgress.innerHTML += '<div class="progress-step">✅ Domain validated</div>';
        
        // Create project
        const project = await supabaseRequest('projects', 'POST', {
            user_id: currentUser.id,
            username: currentUser.username,
            project_name: projectName || domainName,
            domain_name: `${domainName}.opper.mmr`,
            status: 'deploying'
        });
        
        deployProgress.innerHTML += '<div class="progress-step">✅ Project created</div>';
        
        const projectId = project[0].id;
        
        // Upload files
        for (let file of files) {
            const content = await readFileAsText(file);
            
            await supabaseRequest('project_files', 'POST', {
                project_id: projectId,
                file_name: file.name,
                file_content: content,
                file_size: file.size,
                file_type: file.type || 'text/plain'
            });
            
            deployProgress.innerHTML += `<div class="progress-step">✅ Uploaded ${file.name}</div>`;
        }
        
        // Save environment variables
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
        
        // Update project status
        await supabaseRequest(`projects?id=eq.${projectId}`, 'PATCH', {
            status: 'active',
            updated_at: new Date().toISOString()
        });
        
        // Log deployment
        await supabaseRequest('deployment_logs', 'POST', {
            project_id: projectId,
            action: 'deploy',
            status: 'success',
            message: 'Project deployed successfully'
        });
        
        deployProgress.innerHTML += '<div class="progress-step success">🎉 Deployment successful!</div>';
        deployProgress.innerHTML += `<div class="progress-step success">🌐 Your site: <a href="https://${domainName}.opper.mmr" target="_blank">${domainName}.opper.mmr</a></div>`;
        
        setTimeout(() => {
            closeNewProjectModal();
            loadProjects();
        }, 2000);
        
    } catch (error) {
        console.error('Deploy error:', error);
        deployProgress.innerHTML += `<div class="progress-step error">❌ Error: ${error.message}</div>`;
        deployBtn.disabled = false;
    }
});

// Read File as Text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Edit Project
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

// Edit File
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

// Save File Changes
async function saveFileChanges() {
    const newContent = document.getElementById('fileContentEditor').value;
    const saveProgress = document.getElementById('saveProgress');
    
    saveProgress.classList.add('show');
    saveProgress.innerHTML = '<div class="progress-step">🔄 Saving changes...</div>';
    
    try {
        // Update file content
        await supabaseRequest(`project_files?id=eq.${currentFileId}`, 'PATCH', {
            file_content: newContent,
            file_size: new Blob([newContent]).size,
            updated_at: new Date().toISOString()
        });
        
        saveProgress.innerHTML += '<div class="progress-step">✅ File saved</div>';
        
        // Get project ID
        const file = await supabaseRequest(`project_files?id=eq.${currentFileId}`);
        const projectId = file[0].project_id;
        
        // Update project
        await supabaseRequest(`projects?id=eq.${projectId}`, 'PATCH', {
            updated_at: new Date().toISOString(),
            deploy_count: (await supabaseRequest(`projects?id=eq.${projectId}`))[0].deploy_count + 1
        });
        
        // Log redeploy
        await supabaseRequest('deployment_logs', 'POST', {
            project_id: projectId,
            action: 'redeploy',
            status: 'success',
            message: 'Auto-redeployed after file edit'
        });
        
        saveProgress.innerHTML += '<div class="progress-step success">🎉 Auto-redeployed successfully!</div>';
        
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

// Delete Project
async function deleteProject(projectId, projectName) {
    if (!confirm(`သင် "${projectName}" ကို ဖျက်ရန် သေချာပါသလား?`)) {
        return;
    }
    
    try {
        // Delete project (cascade will delete files, env vars, and logs)
        await supabaseRequest(`projects?id=eq.${projectId}`, 'DELETE');
        
        alert('✅ Project ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ။');
        loadProjects();
        
    } catch (error) {
        console.error('Delete project error:', error);
        alert('❌ Error: Project ဖျက်ရာတွင် အမှားအယွင်းရှိနေပါသည်။');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Opper Deploy Platform Initialized');
});
