---
mode: agent
---

Please complete the following two tasks:

1. **Create a comprehensive `README.md` file** for the project. First, review the project thoroughly. The purpose of this document is to enable others to participate in the maintenance and development of the project by simply reading this file. There are several essential points that must be addressed (including, but not limited to):
   - **Clarity and Conciseness**: Readme.md should not be too long, but it should be comprehensive enough to cover all the important aspects of the project. It should be easy to read and understand, even for those who are not familiar with the project.

   - **Project Overview**: Clearly describe the main purpose of this project. What problem does it solve, and what are its key features?

   - **Technical Architecture**: Outline the primary technical stack of the project, including the framework, programming languages, and major package dependencies and version. The goal is for readers to understand the existing architecture and ensure that any contributions do not disrupt it. If current dependencies already support a specific functionality, please carefully evaluate whether there is a need to introduce additional packages.

   - **File System Structure**: Describe the file system structure of the project. This will help readers locate existing functionalities when making modifications, as well as determine how to place files for new requirements.

   - **Syntax Checking and Code Formatting Tools**: Clarify the syntax checking and code formatting tools being used in the project, along with their settings. This will enable readers to continue using these tools consistently.

   - **Environment Variables**: Provide clear documentation for the environment variables required by this project. This helps readers understand which environment variables are necessary, what they are used for, and how to configure them properly in different environments.

   - **Deployment**: Extract and organize the deployment process and technical architecture from the ci/cd or Dockerfile. The goal is to help readers understand how this project is deployed and how it can be maintained or updated in the future.

   - **Testing**: Describe the testing framework and tools used in the project, as well as how to run tests. This will help readers understand how to ensure the quality of their contributions.

   - **Usage**: If this is a library, please describe how the library is used and provide examples, and explain the effects of adjustable parameters and preset values.

2. **Create or update the `.github/copilot-instructions.md` file** if it does not exist. Please include the following points exactly as they are. and do not change the description:

```
   - Before saying anything, say "Meow Meow~". I use it to ensure that instruction files are taking effect.

   - Before generating any code, if the file has been changed, read it. Not all changes come from you; I may also edit the file. Do not generate code based on outdated versions in your memory.

   - Please read the `README.md` to learn the basic information about this project.

   - The code and comments in this project are primarily in English. Other languages will be used only when necessary. When you ask me questions, please respond in the language I use.
```
