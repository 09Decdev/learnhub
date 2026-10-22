// Gắn video của khoá học với thư mục lab tương ứng trong repo thực hành.
// Khoá "DevOps trên AWS": tên chương bắt đầu bằng "05 - ...", tên video bắt đầu
// bằng "017 ...". Mỗi dòng: [video từ, video đến, thư mục trong repo].

type Range = [number, number, string];
type LabMap = {
  name: string;
  repo: string;          // link GitHub tới nhánh chính của repo thực hành
  tracker?: string;      // trang theo dõi lộ trình
  match: RegExp;         // nhận diện khoá theo tên thư mục gốc
  chapters: Record<string, Range[]>;
};

export const LAB_MAPS: Record<string, LabMap> = {
  "devops-aws": {
    name: "DevOps trên AWS",
    repo: "https://github.com/09Decdev/devops-learning/tree/master/",
    tracker: "https://claude.ai/artifact/4jdCuTiXjQUhMn5agKWJgh",
    match: /devops.*aws/i,
    chapters: {
      "05": [
        [11, 14, "iac-using-terraform/lab2"], [15, 16, "iac-using-terraform/lab3"],
        [17, 17, "iac-using-terraform/lab4"], [18, 19, "iac-using-terraform/lab5"],
        [20, 21, "iac-using-terraform/lab6_part1"], [22, 22, "iac-using-terraform/lab7"],
        [23, 24, "iac-using-terraform/lab8"], [25, 25, "iac-using-terraform/lab9"],
        [26, 27, "iac-using-terraform/lab10"],
      ],
      "06": [[4, 16, "linux-basic-operation"]],
      "07": [[5, 15, "git-basic-operation"]],
      "08": [
        [9, 9, "docker-basic-operation/lab1-docker-basic-command"],
        [11, 11, "docker-basic-operation/lab2-Dockerfile"],
        [12, 12, "docker-basic-operation/lab3-CMD-and-ENTRYPOINT"],
        [13, 14, "docker-basic-operation/lab4-multi-stage-docker-file"],
        [16, 16, "docker-basic-operation/lab5-docker-compose"],
        [17, 17, "docker-basic-operation/lab6-docker-compose-multi"],
        [18, 18, "docker-basic-operation/lab7-docker-compose-load-balance"],
        [20, 28, "docker-basic-operation/lab8-ecs-ecr-lab"],
      ],
      "09": [
        [3, 4, "cicd-using-jenkins"], [5, 5, "cicd-using-jenkins/lab1"], [6, 6, "cicd-using-jenkins/lab2"],
        [8, 10, "cicd-using-jenkins/lab3"], [11, 12, "cicd-using-jenkins/lab4"], [13, 13, "cicd-using-jenkins/lab5"],
        [15, 16, "cicd-using-jenkins/lab6"], [17, 17, "cicd-using-jenkins/lab7"], [18, 18, "cicd-using-jenkins/lab8"],
        [19, 19, "cicd-using-jenkins/lab9"], [21, 21, "cicd-using-jenkins/lab10"], [22, 22, "cicd-using-jenkins/lab11"],
      ],
      "10": [[6, 12, "deployment-strategy/blue-green-demo"]],
      "11": [
        [4, 4, "(new)codepipeline"],
        [5, 6, "(new)codepipeline/lab2-codebuild-java"],
        [7, 8, "(new)codepipeline/lab3-codebuild-nodejs-webpack"],
        [9, 10, "(new)codepipeline/lab4-codebuild-docker"],
        [12, 14, "(new)codepipeline/lab5-codepipeline-java-beanstalk"],
        [15, 16, "(new)codepipeline/lab6-codepipeline-docker-ecs"],
        [17, 20, "(new)codepipeline/lab7-codepipeline-docker-ecs-blue-green"],
        [21, 22, "(new)codepipeline/lab8-codepipeline-docker-ecs-canary"],
      ],
      "12": [[4, 10, "serverless-application-model"]],
      "13": [
        [2, 3, "github-action/lab-1-build-docker-ecr"], [4, 4, "github-action/lab-2-deploy-ecr"],
        [5, 5, "github-action/lab-3-switch-traffic"], [6, 6, "github-action/lab-4-clear-old-resource"],
        [7, 7, "github-action/lab-5-combine-all-actions"], [8, 8, "github-action/lab-6-add-test-step"],
      ],
      "14": [
        [4, 5, "kubernetes-basic"], [6, 6, "kubernetes-basic/lab3-simple-pod-using-yaml"],
        [7, 7, "kubernetes-basic"], [8, 9, "kubernetes-basic/lab4-replica-set-simple"],
        [10, 11, "kubernetes-basic/lab5-deployment-simple"], [12, 13, "kubernetes-basic/lab6-service-NodePort-simple"],
        [14, 16, "kubernetes-basic/lab7-service-ClusterIP-simple"], [17, 18, "kubernetes-basic/lab8-ingress-simple"],
        [19, 20, "kubernetes-basic/lab9-persistent-volume"], [21, 22, "kubernetes-basic/lab10-config-map"],
        [23, 24, "kubernetes-basic/lab11-secret-simple"], [26, 27, "kubernetes-basic/lab12-kops"],
        [28, 31, "kubernetes-basic/lab13-deploy-resources-to-kubernetes"],
      ],
      "15": [
        [3, 3, "EKS-basic/lab1"], [4, 6, "EKS-basic/lab2"], [7, 9, "EKS-basic/lab3-ebs-volume"],
        [10, 11, "EKS-basic/lab4-rbac"],
      ],
      "17": [[5, 12, "monitoring-for-kubernetes-eks/lab1"]],
    },
  },
};

export function detectLabMap(courseName: string): string | undefined {
  return Object.entries(LAB_MAPS).find(([, m]) => m.match.test(courseName))?.[0];
}

const leadingNumber = (s: string) => {
  const m = /^\s*(\d+)/.exec(s);
  return m ? m[1] : null;
};

export function labFor(mapKey: string | undefined, chapterName: string, fileName: string) {
  const map = mapKey ? LAB_MAPS[mapKey] : undefined;
  const ch = leadingNumber(chapterName);
  const v = leadingNumber(fileName);
  if (!map || !ch || !v) return null;
  const ranges = map.chapters[ch.padStart(2, "0")];
  const hit = ranges?.find(([from, to]) => Number(v) >= from && Number(v) <= to);
  if (!hit) return null;
  return { path: hit[2], url: map.repo + encodeURI(hit[2]) };
}

export const trackerFor = (mapKey?: string) => (mapKey ? LAB_MAPS[mapKey]?.tracker : undefined);
