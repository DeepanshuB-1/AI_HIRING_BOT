# Import all models so SQLAlchemy's metadata knows about every table
# before create_all() is called at startup.
from .user import User, UserRole
from .candidate import Candidate, CandidateStatus
from .job import Job
from .call import ScreeningCall, CallStatus
from .report import ScoreReport, AIRecommendation
from .question_bank import QuestionBank, QuestionType, DifficultyLevel
