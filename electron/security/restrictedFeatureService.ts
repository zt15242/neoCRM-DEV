import { licenseService } from './licenseService';
import type { WorkflowLicenseActivateResult, WorkflowLicenseStatus } from '../../shared/types';
import { isRestrictedRole, isRestrictedSkill, type RestrictedFeatureStatus } from '../../shared/restrictedFeatures';

interface AccessLicense {
  getLicenseStatus(): WorkflowLicenseStatus;
  activateLicense(password: string): WorkflowLicenseActivateResult;
}

/** Explicit, process-local disclosure. An existing device license alone never reveals assets. */
export class RestrictedFeatureService {
  private disclosed = false;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<(status: RestrictedFeatureStatus) => void>();

  constructor(private license: AccessLicense) {}

  getStatus(): RestrictedFeatureStatus {
    if (!this.disclosed) return { visible: false };
    const status = this.license.getLicenseStatus();
    if (!status.isAuthorized || (status.expiresAt && Date.now() >= status.expiresAt)) {
      this.lock();
      return { visible: false };
    }
    return { visible: true, expiresAt: status.expiresAt };
  }

  unlock(password: string): { success: boolean; message: string; status: RestrictedFeatureStatus } {
    if (typeof password !== 'string' || !password.trim() || password.length > 8192) {
      return { success: false, message: '验证未通过', status: this.getStatus() };
    }
    const result = this.license.activateLicense(password);
    if (!result.success || !result.status.isAuthorized) {
      return { success: false, message: result.message, status: this.getStatus() };
    }
    this.disclosed = true;
    clearTimeout(this.expiryTimer);
    const expiresAt = result.status.expiresAt;
    if (expiresAt) this.scheduleExpiry(expiresAt);
    const status = this.getStatus();
    this.emit(status);
    return { success: status.visible, message: '验证通过', status };
  }

  private scheduleExpiry(expiresAt: number): void {
    this.expiryTimer = setTimeout(() => {
      if (Date.now() >= expiresAt) this.lock();
      else this.scheduleExpiry(expiresAt);
    }, Math.min(Math.max(1, expiresAt - Date.now()), 2_147_483_647));
    this.expiryTimer.unref?.();
  }

  lock(): RestrictedFeatureStatus {
    const wasVisible = this.disclosed;
    this.disclosed = false;
    clearTimeout(this.expiryTimer);
    const status = { visible: false };
    if (wasVisible) this.emit(status);
    return status;
  }

  canUseRole(id?: string): boolean {
    return !isRestrictedRole(id) || this.getStatus().visible;
  }

  canUseSkill(id?: string): boolean {
    return !isRestrictedSkill(id) || this.getStatus().visible;
  }

  onChange(listener: (status: RestrictedFeatureStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(status: RestrictedFeatureStatus): void {
    for (const listener of this.listeners) listener(status);
  }
}

export const restrictedFeatureService = new RestrictedFeatureService(licenseService);
