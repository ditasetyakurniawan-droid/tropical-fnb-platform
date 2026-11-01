// ==============================================================================
// Jenkinsfile - Enterprise Production CI/CD Pipeline
// Project: Tropical F&B Platform (Modular Monolith)
// Infrastructure: On-Premises Kubernetes HA + Harbor + SonarQube + ArgoCD
// Repositories:
//   - App Code: github.com/ditasetyakurniawan-droid/tropical-fnb-platform
//   - GitOps  : github.com/ditasetyakurniawan-droid/tropical-fnb-platform-gitops
// ==============================================================================

pipeline {
    agent any

    environment {
        // Registry & Image Configuration
        HARBOR_REGISTRY   = 'harbor-dt.co.id'
        HARBOR_PROJECT    = 'devops-apps'
        BACKEND_IMAGE     = 'tropical-fnb-backend'
        FRONTEND_IMAGE    = 'tropical-fnb-frontend'
        HARBOR_CRED_ID    = 'harbor-cred'

        // SonarQube Host (Self-Hosted on 192.168.100.59)
        SONAR_HOST_URL    = 'http://sonar-dt:9000'
        SONAR_HOST_IP     = '192.168.100.59'
        SONAR_TOKEN_ID    = 'sonar-tropical-token'
        MIN_GO_COVERAGE   = '65.0'

        // GitOps Repository & Credentials
        GITOPS_REPO       = 'github.com/ditasetyakurniawan-droid/tropical-fnb-platform-gitops.git'
        GITOPS_CRED_ID    = 'tropical-jenkins-gitops'
        GITOPS_BRANCH     = 'main'

        // Tooling container images
        GO_BUILD_IMAGE    = 'golang:1.24-alpine'
        NODE_BUILD_IMAGE  = 'node:22-alpine'
        SONAR_SCAN_IMAGE  = 'sonarsource/sonar-scanner-cli:latest'
        TRIVY_IMAGE       = 'aquasec/trivy:latest'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_SHORT_SHA = sh(
                        script: 'git rev-parse --short=12 HEAD',
                        returnStdout: true
                    ).trim()
                    echo "Checked out commit SHA: ${env.GIT_SHORT_SHA}"
                }
            }
        }

        stage('Resolve Version') {
            steps {
                script {
                    if (!fileExists('VERSION')) {
                        error "File VERSION tidak ditemukan di root repositori!"
                    }
                    def rawVersion = readFile('VERSION').trim()
                    if (!(rawVersion ==~ /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/)) {
                        error "Format VERSION tidak valid: '${rawVersion}'. Format harus SemVer (contoh: 1.0.0 atau 1.0.0-rc1)"
                    }
                    env.APP_VERSION = rawVersion
                    env.IMAGE_TAG   = "${rawVersion}-${env.GIT_SHORT_SHA}"

                    echo "Release Version: ${env.APP_VERSION}"
                    echo "Immutable Image Tag: ${env.IMAGE_TAG}"
                }
            }
        }

        stage('Backend Quality & Unit Tests') {
            steps {
                sh """
                    docker run --rm \
                      -w /workspace \
                      -v "\$WORKSPACE":/workspace \
                      -e CGO_ENABLED=0 \
                      -e MIN_GO_COVERAGE="\${MIN_GO_COVERAGE}" \
                      ${GO_BUILD_IMAGE} \
                      sh -c '
                        set -euo pipefail
                        cd backend
                        go version
                        go mod verify
                        go vet ./...
                        mkdir -p ../build/reports
                        go test -race -covermode=atomic -coverprofile=coverage.out -json ./... | tee go-test.json
                        test -s coverage.out
                        cd ..
                        ./scripts/normalize-go-coverage.sh backend/coverage.out backend/coverage.sonar.out
                        test -s backend/coverage.sonar.out
                        go tool cover -func=backend/coverage.out | tee build/reports/backend-coverage-summary.txt
                        TOTAL_COVERAGE=\$(go tool cover -func=backend/coverage.out | tail -n 1 | grep -oE "[0-9]+([.][0-9]+)?%" | tr -d "%")
                        echo "Total Go Backend Coverage: \${TOTAL_COVERAGE}% (Minimum Required: \${MIN_GO_COVERAGE}%)"
                        awk -v cov="\${TOTAL_COVERAGE}" -v min="\${MIN_GO_COVERAGE}" "BEGIN { if ((cov + 0) < (min + 0)) exit 1 }"
                      '
                """
            }
        }

        stage('Frontend Quality & Unit Tests') {
            steps {
                sh """
                    docker run --rm \
                      -w /workspace/frontend \
                      -v "\$WORKSPACE":/workspace \
                      -e CI=true \
                      ${NODE_BUILD_IMAGE} \
                      sh -c '
                        set -euo pipefail
                        npm ci --no-audit --no-fund
                        npm run lint
                        npm run typecheck
                        npm run test:coverage
                        test -s coverage/lcov.info
                        npm run build
                      '
                """
            }
        }

        stage('SonarQube Static Analysis') {
            steps {
                withCredentials([
                    string(
                        credentialsId: "${SONAR_TOKEN_ID}",
                        variable: 'SONAR_TOKEN'
                    )
                ]) {
                    sh """
                        docker run --rm \
                          --add-host sonar-dt:${SONAR_HOST_IP} \
                          -w /workspace \
                          -v "\$WORKSPACE":/workspace \
                          -e SONAR_TOKEN="\${SONAR_TOKEN}" \
                          ${SONAR_SCAN_IMAGE} \
                          -Dsonar.host.url="${SONAR_HOST_URL}" \
                          -Dsonar.qualitygate.wait=true \
                          -Dsonar.qualitygate.timeout=300
                    """
                }
            }
        }

        stage('Quality Gate Verification') {
            steps {
                script {
                    echo "Quality Gate verified successfully on SonarQube (${SONAR_HOST_URL})."
                }
            }
        }

        stage('Build Container Images') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo "Building Backend: ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${BACKEND_IMAGE}:${IMAGE_TAG}"
                    sh """
                        docker build \
                          -f backend/Dockerfile \
                          --build-arg VERSION=${APP_VERSION} \
                          --build-arg COMMIT=${GIT_SHORT_SHA} \
                          -t ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${BACKEND_IMAGE}:${IMAGE_TAG} \
                          backend/
                    """

                    echo "Building Frontend: ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${FRONTEND_IMAGE}:${IMAGE_TAG}"
                    sh """
                        docker build \
                          -f frontend/Dockerfile \
                          -t ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${FRONTEND_IMAGE}:${IMAGE_TAG} \
                          frontend/
                    """
                }
            }
        }

        stage('Trivy Vulnerability Scan') {
            when {
                branch 'main'
            }
            steps {
                sh """
                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      ${TRIVY_IMAGE} image \
                      --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      --no-progress \
                      ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${BACKEND_IMAGE}:${IMAGE_TAG}

                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      ${TRIVY_IMAGE} image \
                      --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      --no-progress \
                      ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${FRONTEND_IMAGE}:${IMAGE_TAG}
                """
            }
        }

        stage('Push to Harbor Registry') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: "${HARBOR_CRED_ID}",
                        usernameVariable: 'HARBOR_USER',
                        passwordVariable: 'HARBOR_PASS'
                    )
                ]) {
                    sh """
                        set -eu
                        export DOCKER_CONFIG="\$WORKSPACE/.docker-ci"
                        rm -rf "\$DOCKER_CONFIG"
                        mkdir -p "\$DOCKER_CONFIG"

                        echo "\$HARBOR_PASS" | docker login "${HARBOR_REGISTRY}" -u "\$HARBOR_USER" --password-stdin

                        docker push "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${BACKEND_IMAGE}:${IMAGE_TAG}"
                        docker push "${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${FRONTEND_IMAGE}:${IMAGE_TAG}"

                        docker logout "${HARBOR_REGISTRY}" || true
                        rm -rf "\$DOCKER_CONFIG"
                    """
                }
            }
        }

        stage('Update GitOps & Promote') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: "${GITOPS_CRED_ID}",
                        usernameVariable: 'GIT_USER',
                        passwordVariable: 'GIT_TOKEN'
                    )
                ]) {
                    sh """
                        set -eu
                        rm -rf gitops-repo
                        git clone https://\${GIT_USER}:\${GIT_TOKEN}@${GITOPS_REPO} gitops-repo
                        cd gitops-repo

                        # Update tags in Helm values
                        sed -i 's|tag: ".*" # backend-tag|tag: "${IMAGE_TAG}" # backend-tag|g' helm/tropical-fnb/values.yaml
                        sed -i 's|tag: ".*" # frontend-tag|tag: "${IMAGE_TAG}" # frontend-tag|g' helm/tropical-fnb/values.yaml

                        git config user.email "jenkins@dt.co.id"
                        git config user.name "Jenkins CI"

                        git add helm/tropical-fnb/values.yaml
                        if git diff --cached --quiet; then
                            echo "Tidak ada perubahan tag di GitOps."
                        else
                            git commit -m "chore(release): promote tropical-fnb images to ${IMAGE_TAG}"
                            git push origin ${GITOPS_BRANCH}
                            echo "GitOps repo successfully updated -> ${IMAGE_TAG}"
                        fi
                    """
                }
            }
        }
    }

    post {
        success {
            echo "SUCCESS: Tropical F&B Platform build & delivery completed!"
            echo "Harbor Artifacts: ${HARBOR_REGISTRY}/${HARBOR_PROJECT}/{${BACKEND_IMAGE}, ${FRONTEND_IMAGE}}:${IMAGE_TAG}"
        }
        failure {
            echo "FAILED: Tropical F&B Pipeline failed. Check console log for details."
        }
        always {
            archiveArtifacts artifacts: 'backend/coverage.out,backend/coverage.sonar.out,backend/go-test.json,frontend/coverage/lcov.info,build/reports/**', allowEmptyArchive: true
            sh '''
                rm -rf "$WORKSPACE/.docker-ci" || true
                rm -rf "$WORKSPACE/gitops-repo" || true
                docker image prune -f || true
            '''
        }
    }
}
