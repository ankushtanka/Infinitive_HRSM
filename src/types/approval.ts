export type ApprovalType =
  | 'LEAVE'
  | 'ATTENDANCE_CORRECTION'
  | 'PROFILE_CHANGE'
  | 'ASSET_REQUEST'
  | 'RESIGNATION';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ApprovalHistoryStep {
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMMENTED';
  performedBy: string;
  performedById?: string;
  role?: string;
  timestamp: string;
  comments?: string;
}

export interface ApprovalItem {
  id: string;
  _id?: string;
  organizationId: string;
  requestType: ApprovalType;
  referenceNumber: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar?: string;
  department: string;
  designation: string;
  title: string;
  details: {
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    durationDays?: number;
    reason?: string;

    // Attendance correction
    attendanceDate?: string;
    checkInTime?: string;
    checkOutTime?: string;
    correctionReason?: string;

    // Profile change
    requestedChanges?: Record<string, any>;

    // Asset request
    assetType?: string;
    assetName?: string;
    urgency?: string;

    // Resignation
    resignationReason?: string;
    lastWorkingDay?: string;
    noticePeriodDays?: number;

    // Leave specific enhancements
    isUrgent?: boolean;
    durationType?: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM_HOURS';
    session?: 'FIRST_HALF' | 'SECOND_HALF';
    requestedStartTime?: string;
    requestedEndTime?: string;
    requestedHours?: number;
    requestedDays?: number;

    [key: string]: any;
  };
  isUrgent?: boolean;
  status: ApprovalStatus;
  submittedAt: string;
  updatedAt?: string;
  history?: ApprovalHistoryStep[];
  sourceCollection: string;
  canApprove?: boolean;
}

export interface ApprovalsSummaryStats {
  pendingCount: number;
  approvedThisMonthCount: number;
  rejectedThisMonthCount: number;
  avgProcessingTimeHours: number;
}
