import type { ErrorCategory, ErrorCode } from "./types";

const codeCategoryMap = new Map<ErrorCode, ErrorCategory>([
  [0, "authorization"],
  [190, "authorization"],
  [3, "permission"],
  [10, "permission"],
  [200, "permission"],
  [201, "permission"],
  [202, "permission"],
  [203, "permission"],
  [204, "permission"],
  [205, "permission"],
  [206, "permission"],
  [207, "permission"],
  [208, "permission"],
  [209, "permission"],
  [210, "permission"],
  [211, "permission"],
  [212, "permission"],
  [213, "permission"],
  [214, "permission"],
  [215, "permission"],
  [216, "permission"],
  [217, "permission"],
  [218, "permission"],
  [219, "permission"],
  [4, "throttling"],
  [80007, "throttling"],
  [130429, "throttling"],
  [131048, "throttling"],
  [131056, "throttling"],
  [33, "parameter"],
  [100, "parameter"],
  [130472, "parameter"],
  [131008, "parameter"],
  [131009, "parameter"],
  [131021, "parameter"],
  [131026, "parameter"],
  [131051, "media"],
  [131052, "media"],
  [131053, "media"],
  [131000, "server"],
  [131016, "server"],
  [131057, "server"],
  [133004, "server"],
  [133005, "server"],
  [368, "integrity"],
  [130497, "integrity"],
  [131031, "integrity"],
  [131047, "reengagementWindow"],
  [131037, "wabaConfig"],
  [131042, "businessEligibility"],
  [131045, "phoneRegistration"],
  [133000, "phoneRegistration"],
  [133006, "phoneRegistration"],
  [133008, "phoneRegistration"],
  [133009, "phoneRegistration"],
  [133010, "phoneRegistration"],
  [133015, "phoneRegistration"],
  [133016, "phoneRegistration"],
  [132000, "template"],
  [132001, "template"],
  [132005, "template"],
  [132007, "template"],
  [132012, "template"],
  [132015, "template"],
  [132016, "template"],
  [132068, "flow"],
  [132069, "flow"],
  [134011, "businessEligibility"],
  [135000, "parameter"],
  [2593107, "synchronization"],
  [2593108, "synchronization"]
]);

const permissionRangeStart = 200;
const permissionRangeEnd = 299;

export function categorizeErrorCode(code: number | undefined, httpStatus: number): ErrorCategory {
  if (typeof code === "number") {
    const category = codeCategoryMap.get(code as ErrorCode);
    if (category) {
      return category;
    }

    if (code >= permissionRangeStart && code <= permissionRangeEnd) {
      return "permission";
    }
  }

  if (httpStatus === 401) {
    return "authorization";
  }

  if (httpStatus === 403) {
    return "permission";
  }

  if (httpStatus === 404) {
    return "parameter";
  }

  if (httpStatus === 429) {
    return "throttling";
  }

  if (httpStatus >= 500) {
    return "server";
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    return "parameter";
  }

  return "unknown";
}
